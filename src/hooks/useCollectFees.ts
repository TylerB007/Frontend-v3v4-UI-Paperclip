"use client";

/**
 * useCollectFees — collect accrued Uniswap V4 LP fees for a position.
 *
 * Data flow:
 *   1. StateView multicall (getSlot0 + getFeeGrowthGlobals + getTickInfo×2)
 *      → computes tokensOwed0 / tokensOwed1 for pre-confirm display.
 *   2. Mutation builds V4PositionPlanner calldata:
 *        DECREASE_LIQUIDITY(tokenId, 0, 0, 0)  ← collect fees without removing liquidity
 *        TAKE_PAIR(currency0, currency1, recipient) ← send fees to user
 *      Wrapped in Universal Router V4_POSITION_MANAGER_CALL.
 *   3. On success: invalidates usePositions query so the dashboard refreshes.
 *
 * All async state managed by TanStack Query — no useEffect.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChainId, usePublicClient, useAccount, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { V4PositionPlanner, Actions } from "@uniswap/v4-sdk";
import { RoutePlanner, CommandType } from "@uniswap/universal-router-sdk";
import { getContracts, type SupportedChainId, SUPPORTED_CHAIN_IDS } from "@/config/contracts";
import { UNIVERSAL_ROUTER_ABI, STATE_VIEW_ABI } from "@/abis";
import type { Position } from "@/hooks/usePositions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCollectFeesResult {
  /** Accrued token0 fees (raw, unscaled). undefined while loading. */
  tokensOwed0: bigint | undefined;
  /** Accrued token1 fees (raw, unscaled). undefined while loading. */
  tokensOwed1: bigint | undefined;
  isLoadingOwed: boolean;
  collectFees: () => void;
  isPending: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
}

// ---------------------------------------------------------------------------
// Pure helpers — unit-testable
// ---------------------------------------------------------------------------

const MOD_256 = 2n ** 256n;

/** Wrapping subtraction (uint256 semantics, matches Solidity unchecked) */
function sub256(a: bigint, b: bigint): bigint {
  return ((a - b) % MOD_256 + MOD_256) % MOD_256;
}

/**
 * Compute the fee growth that accumulated *inside* a tick range.
 * Mirrors Uniswap V3/V4 Position.getFeeGrowthInside() logic.
 */
export function computeFeeGrowthInside(
  globalFG: bigint,
  tickLowerFGOutside: bigint,
  tickUpperFGOutside: bigint,
  currentTick: number,
  tickLower: number,
  tickUpper: number,
): bigint {
  // Fee growth below the lower tick
  const fgBelow =
    currentTick >= tickLower ? tickLowerFGOutside : sub256(globalFG, tickLowerFGOutside);

  // Fee growth above the upper tick
  const fgAbove =
    currentTick < tickUpper ? tickUpperFGOutside : sub256(globalFG, tickUpperFGOutside);

  return sub256(sub256(globalFG, fgBelow), fgAbove);
}

/**
 * Compute tokens owed to an LP from accumulated fee growth.
 * tokensOwed = liquidity * (feeGrowthInside_now - feeGrowthInside_last) / 2^128
 */
export function computeTokensOwed(
  liquidity: bigint,
  feeGrowthInsideCurrent: bigint,
  feeGrowthInsideLast: bigint,
): bigint {
  const delta = sub256(feeGrowthInsideCurrent, feeGrowthInsideLast);
  return (liquidity * delta) >> 128n;
}

/**
 * Build Universal Router calldata for fee collection via V4PositionPlanner.
 *
 * Actions: DECREASE_LIQUIDITY(0) → TAKE_PAIR(currency0, currency1, recipient)
 */
export function buildCollectFeesCalldata(
  tokenId: bigint,
  currency0: Address,
  currency1: Address,
  recipient: Address,
): { commands: `0x${string}`; inputs: readonly `0x${string}`[] } {
  const v4Planner = new V4PositionPlanner();

  // DECREASE_LIQUIDITY with liquidity=0 triggers fee settlement without removing liquidity
  v4Planner.addDecrease(tokenId.toString(), "0", "0", "0");

  // Take both fee tokens directly to the recipient
  v4Planner.addAction(Actions.TAKE_PAIR, [currency0 as string, currency1 as string, recipient as string]);

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
 * Collect accrued fees for a Uniswap V4 position.
 *
 * @param position - Position object from usePositions (includes liquidity + fee growth state)
 *
 * @example
 * const { tokensOwed0, tokensOwed1, collectFees, isPending } = useCollectFees(position)
 */
export function useCollectFees(position: Position | null): UseCollectFeesResult {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address: userAddress } = useAccount();
  const { writeContractAsync, isPending, error: writeError, data: txHash } = useWriteContract();
  const queryClient = useQueryClient();

  const enabled =
    Boolean(position) &&
    Boolean(publicClient) &&
    isSupportedChainId(chainId);

  // Compute estimated tokensOwed via StateView multicall
  const owedQuery = useQuery({
    queryKey: [
      "collectFeesOwed",
      position?.tokenId?.toString(),
      position?.poolId,
      chainId,
    ],
    queryFn: async () => {
      if (!position || !publicClient) throw new Error("Missing position");
      const { stateView } = getContracts(chainId as SupportedChainId);

      // Fetch: slot0 (current tick), global fee growth, tick fee growth outside for both bounds
      const [slot0Result, globalFGResult, tickLowerResult, tickUpperResult] =
        await publicClient.multicall({
          contracts: [
            {
              address: stateView as Address,
              abi: STATE_VIEW_ABI,
              functionName: "getSlot0",
              args: [position.poolId],
            },
            {
              address: stateView as Address,
              abi: STATE_VIEW_ABI,
              functionName: "getFeeGrowthGlobals",
              args: [position.poolId],
            },
            {
              address: stateView as Address,
              abi: STATE_VIEW_ABI,
              functionName: "getTickInfo",
              args: [position.poolId, position.tickLower],
            },
            {
              address: stateView as Address,
              abi: STATE_VIEW_ABI,
              functionName: "getTickInfo",
              args: [position.poolId, position.tickUpper],
            },
          ],
          allowFailure: false,
        });

      type Slot0Result = readonly [bigint, number, number, number];
      type GlobalFGResult = readonly [bigint, bigint];
      type TickInfoResult = readonly [bigint, bigint, bigint, bigint];

      const [, currentTick] = slot0Result as Slot0Result;
      const [globalFG0, globalFG1] = globalFGResult as GlobalFGResult;
      const [, , tickLowerFG0Outside, tickLowerFG1Outside] = tickLowerResult as TickInfoResult;
      const [, , tickUpperFG0Outside, tickUpperFG1Outside] = tickUpperResult as TickInfoResult;

      const feeGrowthInside0 = computeFeeGrowthInside(
        globalFG0,
        tickLowerFG0Outside,
        tickUpperFG0Outside,
        currentTick,
        position.tickLower,
        position.tickUpper,
      );

      const feeGrowthInside1 = computeFeeGrowthInside(
        globalFG1,
        tickLowerFG1Outside,
        tickUpperFG1Outside,
        currentTick,
        position.tickLower,
        position.tickUpper,
      );

      const tokensOwed0 = computeTokensOwed(
        position.liquidity,
        feeGrowthInside0,
        position.feeGrowthInside0LastX128,
      );

      const tokensOwed1 = computeTokensOwed(
        position.liquidity,
        feeGrowthInside1,
        position.feeGrowthInside1LastX128,
      );

      return { tokensOwed0, tokensOwed1 };
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!position || !publicClient || !userAddress) {
        throw new Error("Wallet not connected or missing position");
      }
      if (!isSupportedChainId(chainId)) throw new Error("Unsupported chain");

      const contracts = getContracts(chainId);
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + 1800n;

      const { commands, inputs } = buildCollectFeesCalldata(
        position.tokenId,
        position.poolKey.currency0,
        position.poolKey.currency1,
        userAddress,
      );

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
      await queryClient.invalidateQueries({ queryKey: ["collectFeesOwed"] });
    },
  });

  return {
    tokensOwed0: owedQuery.data?.tokensOwed0,
    tokensOwed1: owedQuery.data?.tokensOwed1,
    isLoadingOwed: owedQuery.isLoading,
    collectFees: () => collectMutation.mutate(),
    isPending: isPending || collectMutation.isPending,
    isConfirmed: collectMutation.isSuccess,
    isError: collectMutation.isError,
    error: (collectMutation.error as Error | null) ?? (writeError as Error | null) ?? null,
    txHash,
  };
}
