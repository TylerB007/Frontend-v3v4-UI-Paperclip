/**
 * Uniswap V4 Subgraph Client
 *
 * Approach: The Graph / Uniswap V4 subgraph for position enumeration.
 * - Primary: query the V4 subgraph via The Graph's decentralized network.
 * - Endpoints configured via NEXT_PUBLIC_SUBGRAPH_URL_MAINNET and
 *   NEXT_PUBLIC_SUBGRAPH_URL_BASE environment variables.
 * - If an endpoint is not configured, callers fall back to Viem getLogs
 *   (see usePositionIds.ts).
 *
 * Known subgraph IDs (The Graph decentralized network, as of deployment):
 *   Mainnet: DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM3nMiqki
 *   Base:    GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz
 * Full URL format:
 *   https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/{SUBGRAPH_ID}
 * NOTE: The Graph API key is embedded in the URL — this is standard practice
 * for NEXT_PUBLIC_ vars in PoC phase. Rotate to a route handler proxy before
 * production if cost exposure is a concern.
 */

import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Endpoint config
// ---------------------------------------------------------------------------

const SUBGRAPH_URLS: Record<number, string | undefined> = {
  1: process.env.NEXT_PUBLIC_SUBGRAPH_URL_MAINNET,
  8453: process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE,
  11155111: process.env.NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA,
  84532: process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA,
};

export function getSubgraphUrl(chainId: number): string | undefined {
  return SUBGRAPH_URLS[chainId];
}

// ---------------------------------------------------------------------------
// Generic GraphQL fetch
// ---------------------------------------------------------------------------

export class SubgraphError extends Error {
  constructor(
    message: string,
    public readonly errors?: unknown[],
  ) {
    super(message);
    this.name = "SubgraphError";
  }
}

async function gql<T>(
  url: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new SubgraphError(
      `Subgraph request failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as { data?: T; errors?: unknown[] };

  if (json.errors && json.errors.length > 0) {
    throw new SubgraphError("Subgraph returned errors", json.errors);
  }

  if (json.data === undefined) {
    throw new SubgraphError("Subgraph response missing data field");
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Uniswap V4 subgraph types
// ---------------------------------------------------------------------------

/**
 * A Position entity as returned by the Uniswap V4 subgraph.
 * The `id` field is the tokenId encoded as a hex string.
 */
export interface SubgraphPosition {
  id: string;
  owner: string;
  liquidity: string;
  tickLower: number;
  tickUpper: number;
  pool: {
    id: string;
  } | null;
}

export interface SubgraphPositionsResponse {
  positions: SubgraphPosition[];
}

/**
 * A Transfer event entity for ERC-721 tokenId tracking.
 * Used to find all tokenIds ever received by a wallet.
 */
export interface SubgraphTransfer {
  tokenId: string;
  from: string;
  to: string;
  blockNumber: string;
  timestamp: string;
}

export interface SubgraphTransfersResponse {
  transfers: SubgraphTransfer[];
}

/**
 * A ModifyLiquidity event entity.
 */
export interface SubgraphModifyLiquidityEvent {
  id: string;
  tokenId: string;
  tickLower: number;
  tickUpper: number;
  liquidityDelta: string;
  blockNumber: string;
  timestamp: string;
  transactionHash: string;
}

export interface SubgraphModifyLiquidityResponse {
  modifyLiquidityEvents: SubgraphModifyLiquidityEvent[];
}

// ---------------------------------------------------------------------------
// Query: positions owned by a wallet
// ---------------------------------------------------------------------------

const POSITIONS_BY_OWNER_QUERY = /* GraphQL */ `
  query PositionsByOwner($owner: Bytes!, $first: Int!, $skip: Int!) {
    positions(
      where: { owner: $owner }
      first: $first
      skip: $skip
      orderBy: id
      orderDirection: asc
    ) {
      id
      owner
      liquidity
      tickLower
      tickUpper
      pool {
        id
      }
    }
  }
`;

const PAGE_SIZE = 1000;

/**
 * Fetch all positions currently owned by a wallet address from the subgraph.
 * Paginates through results automatically (The Graph has a 1000-item max per query).
 *
 * @returns Array of SubgraphPosition objects.
 * @throws SubgraphError if the request fails.
 */
export async function fetchPositionsByOwner(
  owner: Address,
  chainId: number,
): Promise<SubgraphPosition[]> {
  const url = getSubgraphUrl(chainId);
  if (!url) {
    throw new SubgraphError(
      `No subgraph URL configured for chain ${chainId}. ` +
        `Set NEXT_PUBLIC_SUBGRAPH_URL_MAINNET / NEXT_PUBLIC_SUBGRAPH_URL_BASE.`,
    );
  }

  const all: SubgraphPosition[] = [];
  let skip = 0;

  while (true) {
    const data = await gql<SubgraphPositionsResponse>(
      url,
      POSITIONS_BY_OWNER_QUERY,
      { owner: owner.toLowerCase(), first: PAGE_SIZE, skip },
    );

    all.push(...data.positions);

    if (data.positions.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Query: Transfer events for a wallet (for complete tokenId history)
// ---------------------------------------------------------------------------

const TRANSFERS_TO_WALLET_QUERY = /* GraphQL */ `
  query TransfersToWallet($to: Bytes!, $first: Int!, $skip: Int!) {
    transfers(
      where: { to: $to }
      first: $first
      skip: $skip
      orderBy: blockNumber
      orderDirection: asc
    ) {
      tokenId
      from
      to
      blockNumber
      timestamp
    }
  }
`;

const TRANSFERS_FROM_WALLET_QUERY = /* GraphQL */ `
  query TransfersFromWallet($from: Bytes!, $first: Int!, $skip: Int!) {
    transfers(
      where: { from: $from }
      first: $first
      skip: $skip
      orderBy: blockNumber
      orderDirection: asc
    ) {
      tokenId
      from
      to
      blockNumber
      timestamp
    }
  }
`;

/**
 * Determine all tokenIds currently owned by a wallet by computing the set
 * difference: (received tokenIds) minus (sent tokenIds).
 *
 * This is a more reliable approach than relying solely on the `owner` field,
 * as it handles edge cases where the subgraph's owner field lags.
 */
export async function fetchOwnedTokenIds(
  owner: Address,
  chainId: number,
): Promise<bigint[]> {
  const url = getSubgraphUrl(chainId);
  if (!url) {
    throw new SubgraphError(
      `No subgraph URL configured for chain ${chainId}.`,
    );
  }

  const ownerLower = owner.toLowerCase();

  // Fetch all incoming transfers
  const received: SubgraphTransfer[] = [];
  let skip = 0;
  while (true) {
    const data = await gql<SubgraphTransfersResponse>(
      url,
      TRANSFERS_TO_WALLET_QUERY,
      { to: ownerLower, first: PAGE_SIZE, skip },
    );
    received.push(...data.transfers);
    if (data.transfers.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  // Fetch all outgoing transfers
  const sent: SubgraphTransfer[] = [];
  skip = 0;
  while (true) {
    const data = await gql<SubgraphTransfersResponse>(
      url,
      TRANSFERS_FROM_WALLET_QUERY,
      { from: ownerLower, first: PAGE_SIZE, skip },
    );
    sent.push(...data.transfers);
    if (data.transfers.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  // Compute currently owned = received - sent
  const sentSet = new Set(sent.map((t) => t.tokenId));
  const owned = received
    .map((t) => t.tokenId)
    .filter((id) => !sentSet.has(id));

  // Deduplicate (a tokenId can be received multiple times if transferred back)
  const unique = [...new Set(owned)];

  return unique.map((id) => BigInt(id));
}

// ---------------------------------------------------------------------------
// Query: ModifyLiquidity history for a tokenId
// ---------------------------------------------------------------------------

const MODIFY_LIQUIDITY_QUERY = /* GraphQL */ `
  query ModifyLiquidityHistory($tokenId: String!, $first: Int!, $skip: Int!) {
    modifyLiquidityEvents(
      where: { tokenId: $tokenId }
      first: $first
      skip: $skip
      orderBy: blockNumber
      orderDirection: asc
    ) {
      id
      tokenId
      tickLower
      tickUpper
      liquidityDelta
      blockNumber
      timestamp
      transactionHash
    }
  }
`;

/**
 * Fetch the full ModifyLiquidity history for a specific tokenId.
 * Used by the Position Log module to reconstruct P&L.
 */
export async function fetchModifyLiquidityHistory(
  tokenId: bigint,
  chainId: number,
): Promise<SubgraphModifyLiquidityEvent[]> {
  const url = getSubgraphUrl(chainId);
  if (!url) {
    throw new SubgraphError(
      `No subgraph URL configured for chain ${chainId}.`,
    );
  }

  const all: SubgraphModifyLiquidityEvent[] = [];
  let skip = 0;

  while (true) {
    const data = await gql<SubgraphModifyLiquidityResponse>(
      url,
      MODIFY_LIQUIDITY_QUERY,
      { tokenId: tokenId.toString(), first: PAGE_SIZE, skip },
    );

    all.push(...data.modifyLiquidityEvents);

    if (data.modifyLiquidityEvents.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Normalised result type for position enumeration
// ---------------------------------------------------------------------------

/**
 * Normalised position data returned by the data layer.
 * tokenId is the primary key; used by the DeFi Engineer's usePositions hook.
 */
export interface PositionSummary {
  tokenId: bigint;
  owner: Address;
  poolId: string | null;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}

export function normalisePosition(p: SubgraphPosition): PositionSummary {
  return {
    tokenId: BigInt(p.id),
    owner: p.owner as Address,
    poolId: p.pool?.id ?? null,
    tickLower: p.tickLower,
    tickUpper: p.tickUpper,
    liquidity: BigInt(p.liquidity),
  };
}
