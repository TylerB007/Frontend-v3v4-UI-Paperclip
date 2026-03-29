"use client";

/**
 * useModifyLiquidity — add or remove liquidity from a Uniswap V4 position.
 *
 * Add liquidity:
 *   1. Compute liquidityDelta from (amount0Desired, amount1Desired, sqrtPrice, tick range)
 *      using standard Uniswap tick math.
 *   2. Check Permit2 allowances for both tokens → PositionManager.
 *      If either is insufficient, prompt user to approve first (approvePermit2).
 *   3. Build V4PositionPlanner: INCREASE_LIQUIDITY → SETTLE_PAIR
 *   4. Wrap in Universal Router V4_POSITION_MANAGER_CALL.
 *
 * Remove liquidity:
 *   1. Compute amount0Min / amount1Min from liquidityDelta + slippage.
 *      Amounts derived from current sqrtPrice and tick range math.
 *   2. Build V4PositionPlanner: DECREASE_LIQUIDITY → TAKE_PAIR
 *   3. Wrap in Universal Router V4_POSITION_MANAGER_CALL.
 *
 * On success: invalidates usePositions query so dashboard refreshes.
 *
 * All async state via TanStack Query — no useEffect.
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChainId, usePublicClient, useAccount, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { V4PositionPlanner, Actions } from "@uniswap/v4-sdk";
import { RoutePlanner, CommandType } from "@uniswap/universal-router-sdk";
import { getContracts, type SupportedChainId, SUPPORTED_CHAIN_IDS } from "@/config/contracts";
import { UNIVERSAL_ROUTER_ABI, PERMIT2_ABI, STATE_VIEW_ABI } from "@/abis";
import type { PoolKey } from "@/hooks/usePositions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiquidityDeltaPreview {
  /** Estimated token0 amount for this liquidity change */
  amount0: bigint;
  /** Estimated token1 amount for this liquidity change */
  amount1: bigint;
  /** Computed liquidity delta (positive = add, negative = remove) */
  liquidityDelta: bigint;
}

export interface UseModifyLiquidityParams {
  tokenId: bigint;
  poolKey: PoolKey;
  tickLower: number;
  tickUpper: number;
  /**
   * Positive to add, negative to remove.
   * For add: set amount0Desired + amount1Desired; hook derives liquidityDelta from tick math.
   * For remove: pass -(liquidity * removePercent / 100n) directly.
   */
  liquidityDelta: bigint;
  /** For add: desired token0 input (raw) */
  amount0Desired?: bigint;
  /** For add: desired token1 input (raw) */
  amount1Desired?: bigint;
  /** Slippage tolerance in basis points (default 50 = 0.5%) */
  slippageBps?: number;
}

export interface UseModifyLiquidityResult {
  /** Estimated amounts involved; null until params are valid */
  preview: LiquidityDeltaPreview | null;
  isPreviewLoading: boolean;
  /** True when Permit2 allowance must be set before adding */
  needsPermit2Approval: boolean;
  approvePermit2: () => void;
  isApproving: boolean;
  modifyLiquidity: () => void;
  isPending: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
}

// ---------------------------------------------------------------------------
// Pure tick math helpers — unit-testable
// ---------------------------------------------------------------------------

const Q96 = 2n ** 96n;

/** Convert a tick to sqrtPriceX96 using V3/V4 TickMath (via @uniswap/v3-sdk). */
export function getSqrtPriceAtTick(tick: number): bigint {
  return BigInt(TickMath.getSqrtRatioAtTick(tick).toString());
}

/** Compute max liquidity from token0 amount given two sqrt prices. */
function liquidityFromAmount0(sqrtA: bigint, sqrtB: bigint, amount0: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const numerator = amount0 * sqrtA * sqrtB;
  const denominator = Q96 * (sqrtB - sqrtA);
  return denominator === 0n ? 0n : numerator / denominator;
}

/** Compute max liquidity from token1 amount given two sqrt prices. */
function liquidityFromAmount1(sqrtA: bigint, sqrtB: bigint, amount1: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const denominator = sqrtB - sqrtA;
  return denominator === 0n ? 0n : (amount1 * Q96) / denominator;
}

/**
 * Compute the maximum liquidity achievable from given amounts.
 * Mirrors Uniswap V3 maxLiquidityForAmounts().
 */
export function getLiquidityForAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0: bigint,
  amount1: bigint,
): bigint {
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);

  if (sqrtPriceX96 <= sqrtA) {
    // Price below range: only token0 is consumed
    return liquidityFromAmount0(sqrtA, sqrtB, amount0);
  } else if (sqrtPriceX96 < sqrtB) {
    // Price in range: both tokens consumed
    const l0 = liquidityFromAmount0(sqrtPriceX96, sqrtB, amount0);
    const l1 = liquidityFromAmount1(sqrtA, sqrtPriceX96, amount1);
    return l0 < l1 ? l0 : l1;
  } else {
    // Price above range: only token1 is consumed
    return liquidityFromAmount1(sqrtA, sqrtB, amount1);
  }
}

/**
 * Compute token0 amount for a given liquidity and price range.
 * Mirrors Uniswap V3 getAmount0ForLiquidity().
 */
export function getAmount0ForLiquidity(
  sqrtPriceX96: bigint,
  sqrtUpperX96: bigint,
  liquidity: bigint,
): bigint {
  if (sqrtPriceX96 > sqrtUpperX96) return 0n;
  const sqrtLower = sqrtPriceX96;
  const sqrtUpper = sqrtUpperX96;
  return (liquidity * Q96 * (sqrtUpper - sqrtLower)) / (sqrtLower * sqrtUpper);
}

/**
 * Compute token1 amount for a given liquidity and price range.
 * Mirrors Uniswap V3 getAmount1ForLiquidity().
 */
export function getAmount1ForLiquidity(
  sqrtLowerX96: bigint,
  sqrtPriceX96: bigint,
  liquidity: bigint,
): bigint {
  if (sqrtPriceX96 < sqrtLowerX96) return 0n;
  return (liquidity * (sqrtPriceX96 - sqrtLowerX96)) / Q96;
}

/**
 * Estimate token amounts for a given liquidity delta.
 * Returns { amount0, amount1 } using current sqrtPrice and tick bounds.
 */
export function getAmountsForLiquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidityAbs: bigint,
): { amount0: bigint; amount1: bigint } {
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);

  if (sqrtPriceX96 <= sqrtA) {
    return { amount0: getAmount0ForLiquidity(sqrtA, sqrtB, liquidityAbs), amount1: 0n };
  } else if (sqrtPriceX96 < sqrtB) {
    return {
      amount0: getAmount0ForLiquidity(sqrtPriceX96, sqrtB, liquidityAbs),
      amount1: getAmount1ForLiquidity(sqrtA, sqrtPriceX96, liquidityAbs),
    };
  } else {
    return { amount0: 0n, amount1: getAmount1ForLiquidity(sqrtA, sqrtB, liquidityAbs) };
  }
}

// ---------------------------------------------------------------------------
// Pure calldata builders — unit-testable
// ---------------------------------------------------------------------------

export interface BuildIncreaseLiquidityCalldataParams {
  tokenId: bigint;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
  currency0: Address;
  currency1: Address;
}

/**
 * Build Universal Router calldata for INCREASE_LIQUIDITY.
 *
 * Actions: INCREASE_LIQUIDITY → SETTLE_PAIR
 */
export function buildIncreaseLiquidityCalldata(
  params: BuildIncreaseLiquidityCalldataParams,
): { commands: `0x${string}`; inputs: readonly `0x${string}`[] } {
  const { tokenId, liquidity, amount0Max, amount1Max, currency0, currency1 } = params;

  const v4Planner = new V4PositionPlanner();
  v4Planner.addIncrease(tokenId.toString(), liquidity.toString(), amount0Max.toString(), amount1Max.toString());
  // SETTLE_PAIR transfers both tokens from the user (via Permit2) to the PoolManager
  v4Planner.addAction(Actions.SETTLE_PAIR, [currency0 as string, currency1 as string]);

  const positionCalldata = v4Planner.finalize() as `0x${string}`;
  const routePlanner = new RoutePlanner();
  routePlanner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [positionCalldata]);

  return {
    commands: routePlanner.commands as `0x${string}`,
    inputs: routePlanner.inputs as `0x${string}`[],
  };
}

export interface BuildDecreaseLiquidityCalldataParams {
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  currency0: Address;
  currency1: Address;
  recipient: Address;
}

/**
 * Build Universal Router calldata for DECREASE_LIQUIDITY.
 *
 * Actions: DECREASE_LIQUIDITY → TAKE_PAIR
 */
export function buildDecreaseLiquidityCalldata(
  params: BuildDecreaseLiquidityCalldataParams,
): { commands: `0x${string}`; inputs: readonly `0x${string}`[] } {
  const { tokenId, liquidity, amount0Min, amount1Min, currency0, currency1, recipient } = params;

  const v4Planner = new V4PositionPlanner();
  v4Planner.addDecrease(tokenId.toString(), liquidity.toString(), amount0Min.toString(), amount1Min.toString());
  v4Planner.addAction(Actions.TAKE_PAIR, [
    currency0 as string,
    currency1 as string,
    recipient as string,
  ]);

  const positionCalldata = v4Planner.finalize() as `0x${string}`;
  const routePlanner = new RoutePlanner();
  routePlanner.addCommand(CommandType.V4_POSITION_MANAGER_CALL, [positionCalldata]);

  return {
    commands: routePlanner.commands as `0x${string}`,
    inputs: routePlanner.inputs as `0x${string}`[],
  };
}

// ---------------------------------------------------------------------------
// Helper: chain guard
// ---------------------------------------------------------------------------

function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Add or remove liquidity for a Uniswap V4 position.
 *
 * @example — add liquidity
 * const { preview, modifyLiquidity, needsPermit2Approval } = useModifyLiquidity({
 *   tokenId: position.tokenId,
 *   poolKey: position.poolKey,
 *   tickLower: position.tickLower,
 *   tickUpper: position.tickUpper,
 *   liquidityDelta: 1n, // sentinel for add; actual delta derived from amounts
 *   amount0Desired: parseUnits('1', 18),
 *   amount1Desired: parseUnits('3000', 6),
 * })
 *
 * @example — remove 50% of liquidity
 * const { modifyLiquidity } = useModifyLiquidity({
 *   tokenId, poolKey, tickLower, tickUpper,
 *   liquidityDelta: -(position.liquidity / 2n),
 * })
 */
export function useModifyLiquidity(
  params: UseModifyLiquidityParams | null,
): UseModifyLiquidityResult {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address: userAddress } = useAccount();
  const { writeContractAsync, isPending, error: writeError, data: txHash } = useWriteContract();
  const queryClient = useQueryClient();

  const isAdd = (params?.liquidityDelta ?? 0n) >= 0n;
  const enabled =
    Boolean(params) &&
    Boolean(publicClient) &&
    isSupportedChainId(chainId) &&
    params?.liquidityDelta !== 0n;

  // Fetch current sqrtPriceX96 from StateView to compute liquidity / amounts
  const slotQuery = useQuery({
    queryKey: ["poolSlot0", params?.poolKey, chainId],
    queryFn: async () => {
      if (!params || !publicClient) throw new Error("Missing params");
      const { stateView } = getContracts(chainId as SupportedChainId);
      // Compute poolId the same way as usePositions
      const { keccak256, encodeAbiParameters, parseAbiParameters } = await import("viem");
      const poolId = keccak256(
        encodeAbiParameters(
          parseAbiParameters(
            "address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks",
          ),
          [
            params.poolKey.currency0,
            params.poolKey.currency1,
            params.poolKey.fee,
            params.poolKey.tickSpacing,
            params.poolKey.hooks,
          ],
        ),
      );
      return publicClient.readContract({
        address: stateView as Address,
        abi: STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [poolId],
      }) as Promise<readonly [bigint, number, number, number]>;
    },
    enabled,
    staleTime: 15_000,
  });

  // Derive preview (liquidityDelta + amounts) from slot + params
  const preview = useMemo((): LiquidityDeltaPreview | null => {
    if (!params || !slotQuery.data) return null;
    const [sqrtPriceX96] = slotQuery.data;

    if (isAdd) {
      const amount0Desired = params.amount0Desired ?? 0n;
      const amount1Desired = params.amount1Desired ?? 0n;
      if (amount0Desired === 0n && amount1Desired === 0n) return null;

      const liquidityDelta = getLiquidityForAmounts(
        sqrtPriceX96,
        params.tickLower,
        params.tickUpper,
        amount0Desired,
        amount1Desired,
      );

      const { amount0, amount1 } = getAmountsForLiquidity(
        sqrtPriceX96,
        params.tickLower,
        params.tickUpper,
        liquidityDelta,
      );

      return { amount0, amount1, liquidityDelta };
    } else {
      const liquidityAbs = -params.liquidityDelta;
      const { amount0, amount1 } = getAmountsForLiquidity(
        sqrtPriceX96,
        params.tickLower,
        params.tickUpper,
        liquidityAbs,
      );
      return { amount0, amount1, liquidityDelta: params.liquidityDelta };
    }
  }, [params, slotQuery.data, isAdd]);

  // Permit2 allowance check for add liquidity (both tokens need approval)
  const permit2Query = useQuery({
    queryKey: [
      "permit2AllowancePair",
      userAddress,
      params?.poolKey?.currency0,
      params?.poolKey?.currency1,
      chainId,
    ],
    queryFn: async () => {
      if (!params || !publicClient || !userAddress) return null;
      const { permit2, positionManager } = getContracts(chainId as SupportedChainId);

      const [allow0, allow1] = await publicClient.multicall({
        contracts: [
          {
            address: permit2 as Address,
            abi: PERMIT2_ABI,
            functionName: "allowance",
            args: [userAddress, params.poolKey.currency0 as Address, positionManager as Address],
          },
          {
            address: permit2 as Address,
            abi: PERMIT2_ABI,
            functionName: "allowance",
            args: [userAddress, params.poolKey.currency1 as Address, positionManager as Address],
          },
        ],
        allowFailure: false,
      }) as readonly [readonly [bigint, number, number], readonly [bigint, number, number]];

      return {
        amount0: allow0[0],
        amount1: allow1[0],
      };
    },
    enabled: enabled && isAdd && Boolean(userAddress),
    staleTime: 30_000,
  });

  const needsPermit2Approval =
    isAdd &&
    Boolean(preview) &&
    Boolean(permit2Query.data) &&
    (permit2Query.data!.amount0 < (preview?.amount0 ?? 0n) ||
      permit2Query.data!.amount1 < (preview?.amount1 ?? 0n));

  // On-chain Permit2 approval for both tokens → PositionManager
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!params || !isSupportedChainId(chainId)) return;
      const { permit2, positionManager } = getContracts(chainId);
      const approveAmount = 2n ** 160n - 1n;
      const expiration = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days

      await writeContractAsync({
        address: permit2 as Address,
        abi: PERMIT2_ABI,
        functionName: "approve",
        args: [
          params.poolKey.currency0 as Address,
          positionManager as Address,
          approveAmount,
          expiration,
        ],
      });
      await writeContractAsync({
        address: permit2 as Address,
        abi: PERMIT2_ABI,
        functionName: "approve",
        args: [
          params.poolKey.currency1 as Address,
          positionManager as Address,
          approveAmount,
          expiration,
        ],
      });

      await queryClient.invalidateQueries({ queryKey: ["permit2AllowancePair"] });
    },
  });

  // Main modify liquidity mutation
  const modifyMutation = useMutation({
    mutationFn: async () => {
      if (!params || !publicClient || !userAddress || !preview) {
        throw new Error("Wallet not connected or missing liquidity params");
      }
      if (!isSupportedChainId(chainId)) throw new Error("Unsupported chain");

      const contracts = getContracts(chainId);
      const slippageBps = params.slippageBps ?? 50;
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + 1800n;

      let commands: `0x${string}`;
      let inputs: readonly `0x${string}`[];

      if (isAdd) {
        // Add liquidity: use preview amounts as max (position manager takes exactly what's needed)
        const slippageMultiplier = BigInt(10000 + slippageBps);
        const amount0Max = (preview.amount0 * slippageMultiplier) / 10000n;
        const amount1Max = (preview.amount1 * slippageMultiplier) / 10000n;

        ({ commands, inputs } = buildIncreaseLiquidityCalldata({
          tokenId: params.tokenId,
          liquidity: preview.liquidityDelta,
          amount0Max,
          amount1Max,
          currency0: params.poolKey.currency0,
          currency1: params.poolKey.currency1,
        }));
      } else {
        // Remove liquidity: apply slippage to minimum received amounts
        const slippageMultiplier = BigInt(10000 - slippageBps);
        const amount0Min = (preview.amount0 * slippageMultiplier) / 10000n;
        const amount1Min = (preview.amount1 * slippageMultiplier) / 10000n;

        ({ commands, inputs } = buildDecreaseLiquidityCalldata({
          tokenId: params.tokenId,
          liquidity: -params.liquidityDelta,
          amount0Min,
          amount1Min,
          currency0: params.poolKey.currency0,
          currency1: params.poolKey.currency1,
          recipient: userAddress,
        }));
      }

      // Simulate before sending — surface revert reason early
      await publicClient.simulateContract({
        address: contracts.universalRouter as Address,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: "execute",
        args: [commands, [...inputs], deadline],
        account: userAddress,
      });

      await writeContractAsync({
        address: contracts.universalRouter as Address,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: "execute",
        args: [commands, [...inputs], deadline],
      });

      await queryClient.invalidateQueries({ queryKey: ["positions"] });
      await queryClient.invalidateQueries({ queryKey: ["permit2AllowancePair"] });
    },
  });

  return {
    preview,
    isPreviewLoading: slotQuery.isLoading,
    needsPermit2Approval,
    approvePermit2: () => approveMutation.mutate(),
    isApproving: approveMutation.isPending,
    modifyLiquidity: () => modifyMutation.mutate(),
    isPending: isPending || modifyMutation.isPending || approveMutation.isPending,
    isConfirmed: modifyMutation.isSuccess,
    isError: modifyMutation.isError,
    error: (modifyMutation.error as Error | null) ?? (writeError as Error | null) ?? null,
    txHash,
  };
}
