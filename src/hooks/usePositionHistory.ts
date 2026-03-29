"use client";

/**
 * usePositionHistory — on-chain event history for a Uniswap V4 position.
 *
 * Data sources (in preference order):
 *   1. The Graph subgraph: modifyLiquidityEvents for the tokenId (paginated).
 *      - Positive liquidityDelta  → IncreaseLiquidity
 *      - Negative liquidityDelta  → DecreaseLiquidity
 *      - Zero liquidityDelta      → Collect
 *   2. Fallback (no subgraph URL): viem getLogs for the PoolManager's
 *      ModifyLiquidity event, filtered client-side by salt = bytes32(tokenId).
 *      Limited to the last 50 000 blocks for PoC feasibility.
 *
 * Results are sorted by blockNumber descending and paginated with loadMore.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import {
  fetchModifyLiquidityHistory,
  SubgraphError,
  type SubgraphModifyLiquidityEvent,
} from "@/lib/subgraph";
import {
  getContracts,
  type SupportedChainId,
  SUPPORTED_CHAIN_IDS,
} from "@/config/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PositionEventKind =
  | "IncreaseLiquidity"
  | "DecreaseLiquidity"
  | "Collect";

export interface PositionEvent {
  /** Type of event */
  event: PositionEventKind;
  /** Unix timestamp (seconds). 0 if unavailable from on-chain fallback. */
  timestamp: number;
  /** Transaction hash */
  txHash: `0x${string}`;
  blockNumber: bigint;
  /** Raw token0 amount. 0n when not available from source. */
  amount0: bigint;
  /** Raw token1 amount. 0n when not available from source. */
  amount1: bigint;
  /** Signed liquidity delta (positive = add, negative = remove, 0 = collect) */
  liquidityDelta: bigint;
}

export interface UsePositionHistoryResult {
  events: PositionEvent[];
  /** Load next page (appends to events) */
  loadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
// Re-export so PositionLogTable can use the same constant.
export { PAGE_SIZE as HISTORY_PAGE_SIZE };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyEvent(liquidityDelta: bigint): PositionEventKind {
  if (liquidityDelta > 0n) return "IncreaseLiquidity";
  if (liquidityDelta < 0n) return "DecreaseLiquidity";
  return "Collect";
}

function mapSubgraphEvent(e: SubgraphModifyLiquidityEvent): PositionEvent {
  const delta = BigInt(e.liquidityDelta);
  return {
    event: classifyEvent(delta),
    timestamp: Number(e.timestamp),
    txHash: e.transactionHash as `0x${string}`,
    blockNumber: BigInt(e.blockNumber),
    amount0: 0n, // V4 subgraph does not include token amounts per-event currently
    amount1: 0n,
    liquidityDelta: delta,
  };
}

/** Encode tokenId as the bytes32 salt used by PositionManager in V4. */
function tokenIdToSalt(tokenId: bigint): `0x${string}` {
  return `0x${tokenId.toString(16).padStart(64, "0")}`;
}

// ModifyLiquidity event emitted by v4-core PoolManager
const MODIFY_LIQUIDITY_ABI = [
  {
    type: "event",
    name: "ModifyLiquidity",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "tickLower", type: "int24", indexed: false },
      { name: "tickUpper", type: "int24", indexed: false },
      { name: "liquidityDelta", type: "int256", indexed: false },
      { name: "salt", type: "bytes32", indexed: false },
    ],
  },
] as const;

/**
 * On-chain getLogs fallback: fetch ModifyLiquidity events from PoolManager
 * filtered by tokenId salt. Scans the last 50 000 blocks (PoC constraint).
 */
async function fetchLogsForTokenId(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  poolManagerAddress: Address,
  tokenId: bigint,
  skip: number,
): Promise<PositionEvent[]> {
  const salt = tokenIdToSalt(tokenId);
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock > 50_000n ? currentBlock - 50_000n : 0n;

  const logs = await publicClient.getLogs({
    address: poolManagerAddress,
    event: MODIFY_LIQUIDITY_ABI[0],
    fromBlock,
    toBlock: currentBlock,
  });

  // Filter by salt (not indexed → must filter client-side)
  const filtered = logs
    .filter((log) => {
      const args = log.args as { salt?: `0x${string}` };
      return args.salt?.toLowerCase() === salt.toLowerCase();
    })
    .map((log) => {
      const args = log.args as { liquidityDelta?: bigint };
      const delta = args.liquidityDelta ?? 0n;
      return {
        event: classifyEvent(delta),
        timestamp: 0,
        txHash: (log.transactionHash ?? "0x") as `0x${string}`,
        blockNumber: BigInt(log.blockNumber ?? 0),
        amount0: 0n,
        amount1: 0n,
        liquidityDelta: delta,
      } satisfies PositionEvent;
    });

  // Sort descending, apply skip/page
  filtered.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
  return filtered.slice(skip, skip + PAGE_SIZE);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function isSupportedChainId(id: number): id is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(id);
}

/**
 * Returns paginated on-chain event history for a Uniswap V4 position NFT.
 *
 * @param tokenId - The ERC-721 token ID of the position (as bigint).
 * @param chainId - Chain the position lives on.
 *
 * @example
 * const { events, loadMore, hasMore, isLoading } = usePositionHistory(tokenId, chainId);
 */
export function usePositionHistory(
  tokenId: bigint | undefined,
  chainId: number,
): UsePositionHistoryResult {
  const publicClient = usePublicClient({ chainId });

  const query = useInfiniteQuery<PositionEvent[], Error>({
    queryKey: ["positionHistory", tokenId?.toString(), chainId],
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return (lastPageParam as number) + PAGE_SIZE;
    },
    queryFn: async ({ pageParam }): Promise<PositionEvent[]> => {
      const skip = pageParam as number;

      if (!tokenId || !isSupportedChainId(chainId)) return [];

      // --- Primary: subgraph ---
      try {
        const raw = await fetchModifyLiquidityHistory(tokenId, chainId);
        const events = raw.map(mapSubgraphEvent);
        // Sort descending once; slice for the current page
        events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
        return events.slice(skip, skip + PAGE_SIZE);
      } catch (err) {
        // SubgraphError = URL not configured or request failed → try getLogs
        if (!(err instanceof SubgraphError)) throw err;
      }

      // --- Fallback: getLogs ---
      if (!publicClient) return [];
      const contracts = getContracts(chainId);
      return fetchLogsForTokenId(
        publicClient,
        contracts.poolManager as Address,
        tokenId,
        skip,
      );
    },
    enabled: tokenId !== undefined && isSupportedChainId(chainId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const allEvents = query.data?.pages.flat() ?? [];

  return {
    events: allEvents,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    hasMore: query.hasNextPage ?? false,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    error: query.error ?? null,
  };
}
