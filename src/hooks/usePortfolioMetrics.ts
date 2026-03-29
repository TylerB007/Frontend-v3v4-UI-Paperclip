"use client";

/**
 * usePortfolioMetrics — aggregate performance metrics across all V4 positions.
 *
 * NOTE: This is a stub implementation that exposes the correct interface.
 * Real implementation (sqrtPriceX96 → USD math, fee APR calc) will be
 * filled in by the Data Engineer (UNI-16).
 *
 * Input: array of Position objects from usePositions.
 * Output: aggregated portfolio stats.
 */

import { useQuery } from "@tanstack/react-query";
import type { Position } from "@/hooks/usePositions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioMetrics {
  /** Sum of all position values at spot price in USD */
  totalValueLockedUsd: number;
  /** Sum of uncollected fees across positions in USD */
  totalFeesEarnedUsd: number;
  /** Percentage of positions where currentTick ∈ [tickLower, tickUpper] */
  activeRangePercent: number;
  /** Unrealized + realized net P&L in USD */
  netPnlUsd: number;
  /** Annualized fee yield: (totalFeesEarned / TVL) × (365 / daysOpen) */
  feeAprPercent: number;
}

export interface UsePortfolioMetricsResult {
  metrics: PortfolioMetrics | null;
  isLoading: boolean;
  isStale: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Aggregates portfolio-wide metrics for a connected wallet.
 *
 * @param positions - Output of usePositions(address). Pass empty array when
 *   positions are still loading.
 *
 * @example
 * const { positions } = usePositions(address);
 * const { metrics, isLoading } = usePortfolioMetrics(positions);
 */
export function usePortfolioMetrics(
  positions: Position[],
): UsePortfolioMetricsResult {
  const query = useQuery<PortfolioMetrics>({
    queryKey: [
      "portfolioMetrics",
      positions.map((p) => `${p.tokenId.toString()}-${p.chainId}`).join(","),
    ],
    queryFn: async (): Promise<PortfolioMetrics> => {
      // TODO (UNI-16): Replace stub with real implementation:
      //   - Derive token prices from sqrtPriceX96 (Q96 math)
      //   - Sum position TVL: tokenAmounts × spot price
      //   - Sum tokensOwed0/1 from StateView for fee totals
      //   - Compute activeRangePercent from currentTick vs tick ranges
      //   - feeAprPercent: (totalFees / TVL) × (365 / daysOpen)
      return {
        totalValueLockedUsd: 0,
        totalFeesEarnedUsd: 0,
        activeRangePercent: 0,
        netPnlUsd: 0,
        feeAprPercent: 0,
      };
    },
    enabled: positions.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  return {
    metrics: query.data ?? null,
    isLoading: query.isLoading,
    isStale: query.isStale,
    error: query.error ?? null,
  };
}
