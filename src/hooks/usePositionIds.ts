/**
 * usePositionIds — enumerate all Uniswap V4 tokenIds owned by a wallet.
 *
 * Strategy:
 *  1. Primary: query The Graph / Uniswap V4 subgraph via fetchOwnedTokenIds().
 *     Requires NEXT_PUBLIC_SUBGRAPH_URL_MAINNET / NEXT_PUBLIC_SUBGRAPH_URL_BASE.
 *  2. Fallback: if no subgraph URL is configured for the active chain, fall back
 *     to scanning PositionManager ERC-721 Transfer events via viem getLogs.
 *
 * The DeFi Engineer's usePositions hook consumes the returned tokenIds array.
 * Interface contract: { tokenIds: bigint[], isLoading: boolean, error: Error | null }
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import { parseAbiItem, type Address, type PublicClient } from "viem";
import { fetchOwnedTokenIds, getSubgraphUrl, SubgraphError } from "@/lib/subgraph";
import { CONTRACT_ADDRESSES, type SupportedChainId } from "@/config/contracts";

// ---------------------------------------------------------------------------
// ERC-721 Transfer ABI item (used for Viem getLogs fallback)
// ---------------------------------------------------------------------------

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

// ---------------------------------------------------------------------------
// Known PositionManager deployment block numbers (to avoid scanning from genesis)
// These are approximate — adjust if logs are missing or too slow.
// Use BigInt() constructor (not literals) to stay compatible with ES2017 target.
// ---------------------------------------------------------------------------

const POSITION_MANAGER_DEPLOY_BLOCK: Partial<Record<SupportedChainId, bigint>> =
  {
    1: BigInt(21274598), // Ethereum mainnet — V4 launched ~Dec 2024
    8453: BigInt(22890000), // Base — approximate V4 launch block
    11155111: BigInt(6900000), // Sepolia testnet
    84532: BigInt(18000000), // Base Sepolia testnet
  };

// ---------------------------------------------------------------------------
// Viem getLogs fallback
// ---------------------------------------------------------------------------

async function fetchTokenIdsViaLogs(
  owner: Address,
  chainId: number,
  publicClient: PublicClient,
): Promise<bigint[]> {
  const contracts = CONTRACT_ADDRESSES[chainId as SupportedChainId];
  if (!contracts) {
    throw new Error(`Chain ${chainId} is not supported.`);
  }

  const fromBlock =
    POSITION_MANAGER_DEPLOY_BLOCK[chainId as SupportedChainId] ?? BigInt(0);

  // Tokens received by owner (minted or transferred in)
  const receivedLogs = await publicClient.getLogs({
    address: contracts.positionManager,
    event: TRANSFER_EVENT,
    args: { to: owner },
    fromBlock,
    toBlock: "latest",
  });

  // Tokens sent away by owner (transferred out or burned)
  const sentLogs = await publicClient.getLogs({
    address: contracts.positionManager,
    event: TRANSFER_EVENT,
    args: { from: owner },
    fromBlock,
    toBlock: "latest",
  });

  const sentSet = new Set(
    (sentLogs as Array<{ args: { tokenId?: bigint } }>)
      .map((log) => log.args.tokenId)
      .filter((id): id is bigint => id !== undefined)
      .map((id) => id.toString()),
  );

  const owned = (receivedLogs as Array<{ args: { tokenId?: bigint } }>)
    .map((log) => log.args.tokenId)
    .filter((id): id is bigint => id !== undefined)
    .filter((id) => !sentSet.has(id.toString()));

  // Deduplicate
  const unique = [...new Map(owned.map((id) => [id.toString(), id])).values()];

  return unique;
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const positionIdsQueryKey = (
  owner: Address | undefined,
  chainId: number,
) => ["positionIds", owner?.toLowerCase(), chainId] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UsePositionIdsResult {
  tokenIds: bigint[];
  isLoading: boolean;
  error: Error | null;
  dataSource: "subgraph" | "logs" | null;
}

/**
 * Returns all Uniswap V4 tokenIds owned by the given wallet on the active chain.
 *
 * @param walletAddress - The wallet address to enumerate positions for.
 *   Pass `undefined` when the wallet is not connected.
 *
 * @example
 * const { tokenIds, isLoading, error } = usePositionIds(address);
 */
export function usePositionIds(
  walletAddress: Address | undefined,
): UsePositionIdsResult {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });

  const hasSubgraph = Boolean(getSubgraphUrl(chainId));

  const query = useQuery({
    queryKey: [...positionIdsQueryKey(walletAddress, chainId), hasSubgraph],
    queryFn: async (): Promise<{
      tokenIds: bigint[];
      dataSource: "subgraph" | "logs";
    }> => {
      if (!walletAddress) return { tokenIds: [], dataSource: "subgraph" };
      if (!publicClient) throw new Error("No public client available");

      // Attempt subgraph first
      if (hasSubgraph) {
        try {
          const tokenIds = await fetchOwnedTokenIds(walletAddress, chainId);
          return { tokenIds, dataSource: "subgraph" };
        } catch (err) {
          // If it's a config error (no URL) or a network error, fall through to logs.
          // Re-throw unexpected errors.
          if (!(err instanceof SubgraphError) && !(err instanceof TypeError)) {
            throw err;
          }
          console.warn(
            "[usePositionIds] Subgraph unavailable, falling back to getLogs:",
            err,
          );
        }
      }

      // Fallback: Viem getLogs
      const tokenIds = await fetchTokenIdsViaLogs(
        walletAddress,
        chainId,
        publicClient,
      );
      return { tokenIds, dataSource: "logs" };
    },
    enabled: Boolean(walletAddress),
    // Poll every 30 seconds to pick up new positions without a block subscription
    refetchInterval: 30_000,
    // Keep previous data while refetching to avoid UI flicker
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  return {
    tokenIds: query.data?.tokenIds ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
    dataSource: query.data?.dataSource ?? null,
  };
}
