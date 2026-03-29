"use client";

/**
 * usePortfolioMetrics — aggregate analytics for all V4 positions.
 *
 * Computes:
 *   totalValueLockedUsd  — position values at spot price (token1-denominated)
 *   totalFeesEarnedUsd   — uncollected fees via fee-growth math (token1-denominated)
 *   activeRangePercent   — % of positions where currentTick ∈ [tickLower, tickUpper)
 *   netPnlUsd            — 0; requires entry-price data from usePositionHistory
 *   feeAprPercent        — annualised fee yield estimate (30-day default holding window)
 *
 * "USD" denomination: uses pool sqrtPriceX96 only — no external oracle.
 * Values are expressed in token1 units. For WETH/USDC pools this approximates
 * USD well; for other pairs it is token1-denominated value.
 */

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import { erc20Abi, type Address } from "viem";
import type { Position } from "@/hooks/usePositions";
import {
  getContracts,
  type SupportedChainId,
  SUPPORTED_CHAIN_IDS,
} from "@/config/contracts";
import { STATE_VIEW_ABI } from "@/abis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioMetrics {
  /** Sum of all position values at spot price in USD (token1-denominated) */
  totalValueLockedUsd: number;
  /** Sum of uncollected fees across positions in USD (token1-denominated) */
  totalFeesEarnedUsd: number;
  /** Percentage of positions where currentTick ∈ [tickLower, tickUpper) */
  activeRangePercent: number;
  /**
   * Unrealized + realized net P&L in USD.
   * NOTE: requires entry-price data from usePositionHistory — currently returns 0.
   */
  netPnlUsd: number;
  /**
   * Annualised fee yield: (totalFeesEarned / TVL) × (365 / daysOpen).
   * Uses a 30-day default for daysOpen; for exact APR combine with usePositionHistory.
   */
  feeAprPercent: number;
}

export interface UsePortfolioMetricsResult {
  metrics: PortfolioMetrics | null;
  isLoading: boolean;
  isStale: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

const Q96 = 2 ** 96;
const TWO_POW_256 = 2n ** 256n;
const TWO_POW_128 = 2n ** 128n;

/** Wrapping uint256 subtraction — mirrors Solidity unchecked arithmetic. */
function u256Sub(a: bigint, b: bigint): bigint {
  return ((a - b) % TWO_POW_256 + TWO_POW_256) % TWO_POW_256;
}

/** sqrt(1.0001^tick) as a floating-point number (tick boundary price). */
function sqrtPriceAtTick(tick: number): number {
  return Math.sqrt(Math.pow(1.0001, tick));
}

/**
 * Compute token amounts for a concentrated liquidity position.
 * Uses Uniswap V3/V4 concentrated liquidity math.
 *
 * @returns amount0 and amount1 in raw wei (JS numbers — float precision is
 *   acceptable here as we only need USD approximations).
 */
function computeAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
): { amount0: number; amount1: number } {
  if (liquidity === 0n) return { amount0: 0, amount1: 0 };

  const sqrtP = Number(sqrtPriceX96) / Q96;
  const sqrtPa = sqrtPriceAtTick(tickLower);
  const sqrtPb = sqrtPriceAtTick(tickUpper);
  const L = Number(liquidity);

  if (sqrtP <= sqrtPa) {
    // Below range: all token0
    return { amount0: L * (1 / sqrtPa - 1 / sqrtPb), amount1: 0 };
  }
  if (sqrtP >= sqrtPb) {
    // Above range: all token1
    return { amount0: 0, amount1: L * (sqrtPb - sqrtPa) };
  }
  // In range: both tokens
  return {
    amount0: L * (1 / sqrtP - 1 / sqrtPb),
    amount1: L * (sqrtP - sqrtPa),
  };
}

/**
 * Compute uncollected fees using Uniswap V3 fee-growth math.
 * All subtraction uses wrapping uint256 (mirrors Solidity). See whitepaper §6.3.
 */
function computeUncollectedFees(params: {
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  fgGlobal0: bigint;
  fgGlobal1: bigint;
  lowerFgOutside0: bigint;
  lowerFgOutside1: bigint;
  upperFgOutside0: bigint;
  upperFgOutside1: bigint;
}): { fees0: bigint; fees1: bigint } {
  const {
    liquidity,
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128,
    currentTick,
    tickLower,
    tickUpper,
    fgGlobal0,
    fgGlobal1,
    lowerFgOutside0,
    lowerFgOutside1,
    upperFgOutside0,
    upperFgOutside1,
  } = params;

  // feeGrowthBelow = growth accumulated below tickLower
  const fgBelow0 =
    currentTick >= tickLower
      ? lowerFgOutside0
      : u256Sub(fgGlobal0, lowerFgOutside0);
  const fgBelow1 =
    currentTick >= tickLower
      ? lowerFgOutside1
      : u256Sub(fgGlobal1, lowerFgOutside1);

  // feeGrowthAbove = growth accumulated above tickUpper
  const fgAbove0 =
    currentTick < tickUpper
      ? upperFgOutside0
      : u256Sub(fgGlobal0, upperFgOutside0);
  const fgAbove1 =
    currentTick < tickUpper
      ? upperFgOutside1
      : u256Sub(fgGlobal1, upperFgOutside1);

  // feeGrowthInside = global - below - above (wrapping)
  const fgInside0 = u256Sub(u256Sub(fgGlobal0, fgBelow0), fgAbove0);
  const fgInside1 = u256Sub(u256Sub(fgGlobal1, fgBelow1), fgAbove1);

  // tokensOwed = L × (fgInside − fgInsideLast) >> 128
  const fees0 =
    (liquidity * u256Sub(fgInside0, feeGrowthInside0LastX128)) / TWO_POW_128;
  const fees1 =
    (liquidity * u256Sub(fgInside1, feeGrowthInside1LastX128)) / TWO_POW_128;

  return { fees0, fees1 };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function isSupportedChainId(id: number): id is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(id);
}

const EMPTY_METRICS: PortfolioMetrics = {
  totalValueLockedUsd: 0,
  totalFeesEarnedUsd: 0,
  activeRangePercent: 0,
  netPnlUsd: 0,
  feeAprPercent: 0,
};

// Default holding-period assumption when position open timestamps are unavailable.
// 30 days is a conservative PoC placeholder; replace with real daysOpen from
// usePositionHistory for accurate APR.
const DEFAULT_DAYS_OPEN = 30;

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
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });

  const query = useQuery<PortfolioMetrics>({
    queryKey: [
      "portfolioMetrics",
      chainId,
      positions.map((p) => p.tokenId.toString()),
    ],
    queryFn: async (): Promise<PortfolioMetrics> => {
      if (
        !publicClient ||
        !isSupportedChainId(chainId) ||
        positions.length === 0
      ) {
        return EMPTY_METRICS;
      }

      const contracts = getContracts(chainId);
      const stateView = contracts.stateView as Address;

      // Unique pool IDs to deduplicate multicall slots
      const uniquePoolIds = [...new Set(positions.map((p) => p.poolId))];

      // Unique ERC-20 tokens (exclude native ETH zero address)
      const NATIVE_ETH = "0x0000000000000000000000000000000000000000";
      const uniqueErc20Tokens = [
        ...new Set(
          positions
            .flatMap((p) => [p.poolKey.currency0, p.poolKey.currency1])
            .filter((t) => t.toLowerCase() !== NATIVE_ETH),
        ),
      ] as Address[];

      // --- Batch multicalls (5 in parallel) ---

      type Slot0Result = readonly [bigint, number, number, number];
      type FeeGrowthResult = readonly [bigint, bigint];
      type TickInfoResult = readonly [bigint, bigint, bigint, bigint];

      const [
        slot0Results,
        feeGrowthResults,
        tickLowerResults,
        tickUpperResults,
        decimalsResults,
      ] = await Promise.all([
        // getSlot0(poolId) → sqrtPriceX96, currentTick
        publicClient.multicall({
          contracts: uniquePoolIds.map((poolId) => ({
            address: stateView,
            abi: STATE_VIEW_ABI,
            functionName: "getSlot0",
            args: [poolId as `0x${string}`],
          })),
          allowFailure: true,
        }),

        // getFeeGrowthGlobals(poolId) → fg0, fg1
        publicClient.multicall({
          contracts: uniquePoolIds.map((poolId) => ({
            address: stateView,
            abi: STATE_VIEW_ABI,
            functionName: "getFeeGrowthGlobals",
            args: [poolId as `0x${string}`],
          })),
          allowFailure: true,
        }),

        // getTickInfo(poolId, tickLower) per position
        publicClient.multicall({
          contracts: positions.map((p) => ({
            address: stateView,
            abi: STATE_VIEW_ABI,
            functionName: "getTickInfo",
            args: [p.poolId as `0x${string}`, p.tickLower],
          })),
          allowFailure: true,
        }),

        // getTickInfo(poolId, tickUpper) per position
        publicClient.multicall({
          contracts: positions.map((p) => ({
            address: stateView,
            abi: STATE_VIEW_ABI,
            functionName: "getTickInfo",
            args: [p.poolId as `0x${string}`, p.tickUpper],
          })),
          allowFailure: true,
        }),

        // decimals() for each ERC-20 token
        uniqueErc20Tokens.length > 0
          ? publicClient.multicall({
              contracts: uniqueErc20Tokens.map((addr) => ({
                address: addr,
                abi: erc20Abi,
                functionName: "decimals",
              })),
              allowFailure: true,
            })
          : Promise.resolve([]),
      ]);

      // --- Build lookup maps ---

      const poolSlot0 = new Map<
        string,
        { sqrtPriceX96: bigint; currentTick: number }
      >();
      uniquePoolIds.forEach((poolId, i) => {
        const r = slot0Results[i];
        if (r.status === "success" && r.result) {
          const [sqrtPriceX96, tick] = r.result as Slot0Result;
          poolSlot0.set(poolId, { sqrtPriceX96, currentTick: tick });
        }
      });

      const poolFeeGrowth = new Map<string, { fg0: bigint; fg1: bigint }>();
      uniquePoolIds.forEach((poolId, i) => {
        const r = feeGrowthResults[i];
        if (r.status === "success" && r.result) {
          const [fg0, fg1] = r.result as FeeGrowthResult;
          poolFeeGrowth.set(poolId, { fg0, fg1 });
        }
      });

      const tokenDecimals = new Map<string, number>();
      tokenDecimals.set(NATIVE_ETH, 18); // native ETH always 18
      uniqueErc20Tokens.forEach((token, i) => {
        const r = decimalsResults[i];
        tokenDecimals.set(
          token.toLowerCase(),
          r?.status === "success" && typeof r.result === "number"
            ? r.result
            : 18,
        );
      });

      // tick-info keyed by "poolId_tick"
      const tickLowerMap = new Map<string, { fg0: bigint; fg1: bigint }>();
      const tickUpperMap = new Map<string, { fg0: bigint; fg1: bigint }>();
      positions.forEach((p, i) => {
        const rL = tickLowerResults[i];
        if (rL.status === "success" && rL.result) {
          const [, , fg0, fg1] = rL.result as TickInfoResult;
          tickLowerMap.set(`${p.poolId}_${p.tickLower}`, { fg0, fg1 });
        }
        const rU = tickUpperResults[i];
        if (rU.status === "success" && rU.result) {
          const [, , fg0, fg1] = rU.result as TickInfoResult;
          tickUpperMap.set(`${p.poolId}_${p.tickUpper}`, { fg0, fg1 });
        }
      });

      // --- Aggregate ---

      let totalValue = 0;
      let totalFees = 0;
      let inRangeCount = 0;
      let nonZeroCount = 0;

      for (const pos of positions) {
        if (pos.liquidity === 0n) continue;
        nonZeroCount++;

        const slot0 = poolSlot0.get(pos.poolId);
        if (!slot0) continue;

        const dec0 =
          tokenDecimals.get(pos.poolKey.currency0.toLowerCase()) ?? 18;
        const dec1 =
          tokenDecimals.get(pos.poolKey.currency1.toLowerCase()) ?? 18;

        // Token amounts (raw wei as JS float — acceptable for USD estimates)
        const { amount0: raw0, amount1: raw1 } = computeAmounts(
          slot0.sqrtPriceX96,
          pos.tickLower,
          pos.tickUpper,
          pos.liquidity,
        );

        // Human-readable units
        const amount0 = raw0 / Math.pow(10, dec0);
        const amount1 = raw1 / Math.pow(10, dec1);

        // Spot price: token0 in token1 units (decimal-adjusted)
        const sqrtP = Number(slot0.sqrtPriceX96) / Q96;
        const priceToken0InToken1 = sqrtP * sqrtP * Math.pow(10, dec0 - dec1);

        totalValue += amount1 + amount0 * priceToken0InToken1;

        if (
          slot0.currentTick >= pos.tickLower &&
          slot0.currentTick < pos.tickUpper
        ) {
          inRangeCount++;
        }

        // Uncollected fees via fee-growth math
        const fgGlobal = poolFeeGrowth.get(pos.poolId);
        const lowerTick = tickLowerMap.get(`${pos.poolId}_${pos.tickLower}`);
        const upperTick = tickUpperMap.get(`${pos.poolId}_${pos.tickUpper}`);

        if (fgGlobal && lowerTick && upperTick) {
          const { fees0: rawFees0, fees1: rawFees1 } = computeUncollectedFees({
            liquidity: pos.liquidity,
            feeGrowthInside0LastX128: pos.feeGrowthInside0LastX128,
            feeGrowthInside1LastX128: pos.feeGrowthInside1LastX128,
            currentTick: slot0.currentTick,
            tickLower: pos.tickLower,
            tickUpper: pos.tickUpper,
            fgGlobal0: fgGlobal.fg0,
            fgGlobal1: fgGlobal.fg1,
            lowerFgOutside0: lowerTick.fg0,
            lowerFgOutside1: lowerTick.fg1,
            upperFgOutside0: upperTick.fg0,
            upperFgOutside1: upperTick.fg1,
          });

          const fees0 = Number(rawFees0) / Math.pow(10, dec0);
          const fees1 = Number(rawFees1) / Math.pow(10, dec1);
          totalFees += fees1 + fees0 * priceToken0InToken1;
        }
      }

      const activeRangePercent =
        nonZeroCount > 0 ? (inRangeCount / nonZeroCount) * 100 : 0;

      // feeAprPercent = (fees / TVL) × (365 / daysOpen) × 100
      const feeAprPercent =
        totalValue > 0
          ? (totalFees / totalValue) * (365 / DEFAULT_DAYS_OPEN) * 100
          : 0;

      return {
        totalValueLockedUsd: totalValue,
        totalFeesEarnedUsd: totalFees,
        activeRangePercent,
        netPnlUsd: 0, // requires entry-price data from usePositionHistory
        feeAprPercent,
      };
    },
    enabled:
      positions.length > 0 &&
      Boolean(publicClient) &&
      isSupportedChainId(chainId),
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
