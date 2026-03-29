"use client";

/**
 * usePositionHistory — on-chain event history for a given V4 position.
 *
 * NOTE: This is a stub implementation that exposes the correct interface.
 * Real implementation (subgraph query + getLogs fallback) will be
 * filled in by the Data Engineer (UNI-16).
 *
 * Returns paginated array of IncreaseLiquidity / DecreaseLiquidity / Collect
 * events for the given tokenId.
 */

import { useQuery } from "@tanstack/react-query";

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
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** Transaction hash */
  txHash: `0x${string}`;
  blockNumber: bigint;
  /** Raw token0 amount (in token decimals) */
  amount0: bigint;
  /** Raw token1 amount (in token decimals) */
  amount1: bigint;
  /** Signed liquidity delta (positive = add, negative = remove) */
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
// Hook
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

/**
 * Returns paginated event history for a specific V4 position.
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
  const query = useQuery<PositionEvent[]>({
    queryKey: [
      "positionHistory",
      tokenId?.toString(),
      chainId,
    ],
    queryFn: async (): Promise<PositionEvent[]> => {
      if (!tokenId) return [];

      // TODO (UNI-16): Replace stub with real implementation:
      //   - Query The Graph subgraph for IncreaseLiquidity, DecreaseLiquidity,
      //     Collect events on PositionManager filtered by tokenId
      //   - Fallback: useContractEvents / getLogs for each event type
      //   - Sort by blockNumber desc, paginate with `first: PAGE_SIZE, skip`
      //   - Return typed PositionEvent array
      return [];
    },
    enabled: tokenId !== undefined,
    staleTime: 30_000,
  });

  return {
    events: query.data ?? [],
    loadMore: () => {
      // TODO (UNI-16): implement cursor / skip-based pagination
    },
    hasMore: false,
    isLoading: query.isLoading,
    isFetchingMore: false,
    error: query.error ?? null,
  };
}

// Re-export PAGE_SIZE so PositionLogTable can use the same constant.
export { PAGE_SIZE as HISTORY_PAGE_SIZE };
