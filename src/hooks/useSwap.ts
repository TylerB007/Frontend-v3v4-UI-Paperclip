"use client";

/**
 * useSwap — Universal Router V4 swap with 20bps interface fee.
 *
 * Data flow:
 *   1. Quote  → staticCall to V4Quoter (simulateContract) for amountOut estimate.
 *   2. Permit2 check → reads allowance(user, tokenIn, universalRouter) from Permit2.
 *                      If insufficient, signs an EIP-712 PermitSingle and injects
 *                      PERMIT2_PERMIT command into the router call.
 *   3. Execute → writeContract to Universal Router:
 *                  [PERMIT2_PERMIT?] + V4_SWAP + PAY_PORTION (20bps) + SWEEP
 *
 * Interface fee: NEXT_PUBLIC_FEE_RECIPIENT receives 20 bips on every swap.
 * Slippage: default 0.5% (50 bips). Applied to amountOut for exactIn.
 *
 * No useEffect — all async state via TanStack Query.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useChainId,
  usePublicClient,
  useAccount,
  useSignTypedData,
  useWriteContract,
} from "wagmi";
import { type Address } from "viem";
import { V4Planner, Actions } from "@uniswap/v4-sdk";
import { RoutePlanner, CommandType } from "@uniswap/universal-router-sdk";
import { getContracts, type SupportedChainId, SUPPORTED_CHAIN_IDS } from "@/config/contracts";
import { UNIVERSAL_ROUTER_ABI, PERMIT2_ABI, V4_QUOTER_ABI } from "@/abis";
import { env } from "@/lib/env";
import type { PoolKey } from "@/hooks/usePositions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Interface fee: 20 basis points = 0.20% */
export const INTERFACE_FEE_BIPS = 20n;

const MAX_UINT160 = 2n ** 160n - 1n;

/** Permit2 EIP-712 type definitions (per Permit2 spec) */
const PERMIT2_TYPES = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TradeType = "exactIn" | "exactOut";

export interface UseSwapParams {
  poolKey: PoolKey;
  /** true → swap currency0 for currency1 */
  zeroForOne: boolean;
  tradeType: TradeType;
  /** Exact amount in (exactIn) or exact amount out (exactOut), raw units */
  amount: bigint;
  /** Slippage tolerance in basis points (default 50 = 0.5%) */
  slippageBps?: number;
  /** Unix timestamp deadline; defaults to now + 1800s */
  deadline?: bigint;
}

export interface SwapQuote {
  amountOut: bigint;
  amountIn: bigint;
  gasEstimate: bigint;
  /** amountOut net of the 20bps interface fee */
  amountOutAfterFee: bigint;
  /** Estimated price impact as a percentage (0–100). Requires comparison price; 0 when unavailable. */
  priceImpact: number;
}

export interface UseSwapResult {
  quote: SwapQuote | null;
  isQuoteLoading: boolean;
  quoteError: Error | null;
  /** True when ERC20 → Permit2 approve is needed before swapping */
  needsPermit2Approval: boolean;
  /** Call to set ERC20 allowance for Permit2 (one-time per token) */
  approvePermit2: () => void;
  isApproving: boolean;
  swap: () => void;
  isPending: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
}

// ---------------------------------------------------------------------------
// Pure calldata builder — no Wagmi deps, fully unit-testable
// ---------------------------------------------------------------------------

export interface BuildSwapCalldataParams {
  poolKey: PoolKey;
  zeroForOne: boolean;
  tradeType: TradeType;
  amountIn: bigint;
  /** amountOutMin (exactIn) or exact amountOut (exactOut) */
  amountOut: bigint;
  feeRecipient: Address;
  permit2?: {
    token: Address;
    spender: Address;
    amount: bigint;
    expiration: number;
    nonce: number;
    sigDeadline: bigint;
    signature: `0x${string}`;
  };
}

export interface BuildSwapCalldataResult {
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
}

/**
 * Builds Universal Router calldata for a single-hop V4 swap with 20bps fee.
 *
 * Command sequence:
 *   [PERMIT2_PERMIT?] → V4_SWAP → PAY_PORTION(20bps) → SWEEP(amountOutMin)
 *
 * V4_SWAP actions (V4Planner):
 *   SWAP_EXACT_IN_SINGLE (or _OUT) → SETTLE(input, payerIsUser) → TAKE_ALL(output to router)
 */
export function buildSwapCalldata(params: BuildSwapCalldataParams): BuildSwapCalldataResult {
  const { poolKey, zeroForOne, tradeType, amountIn, amountOut, feeRecipient, permit2 } = params;

  const currencyIn = (zeroForOne ? poolKey.currency0 : poolKey.currency1) as string;
  const currencyOut = (zeroForOne ? poolKey.currency1 : poolKey.currency0) as string;

  const rawPoolKey = {
    currency0: poolKey.currency0 as string,
    currency1: poolKey.currency1 as string,
    fee: poolKey.fee,
    tickSpacing: poolKey.tickSpacing,
    hooks: poolKey.hooks as string,
  };

  // Build V4 swap actions
  const v4Planner = new V4Planner();

  if (tradeType === "exactIn") {
    v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
      {
        poolKey: rawPoolKey,
        zeroForOne,
        amountIn: amountIn.toString(),
        amountOutMinimum: "0", // enforced at router level via SWEEP
        hookData: "0x",
      },
    ]);
  } else {
    v4Planner.addAction(Actions.SWAP_EXACT_OUT_SINGLE, [
      {
        poolKey: rawPoolKey,
        zeroForOne,
        amountOut: amountOut.toString(),
        amountInMaximum: amountIn.toString(),
        hookData: "0x",
      },
    ]);
  }

  // Settle input from user via Permit2 (payerIsUser = true)
  v4Planner.addAction(Actions.SETTLE, [currencyIn, amountIn.toString(), true]);
  // Take all output to router (PAY_PORTION + SWEEP will distribute it)
  v4Planner.addAction(Actions.TAKE_ALL, [currencyOut, "0"]);

  const v4Calldata = v4Planner.finalize() as `0x${string}`;

  // Build Universal Router command sequence
  const routePlanner = new RoutePlanner();

  if (permit2) {
    routePlanner.addCommand(CommandType.PERMIT2_PERMIT, [
      {
        details: {
          token: permit2.token as string,
          amount: permit2.amount.toString(),
          expiration: permit2.expiration,
          nonce: permit2.nonce,
        },
        spender: permit2.spender as string,
        sigDeadline: permit2.sigDeadline.toString(),
      },
      permit2.signature,
    ]);
  }

  // V4 swap (output lands in router)
  routePlanner.addCommand(CommandType.V4_SWAP, [v4Calldata]);

  // 20bps interface fee sent to fee recipient
  routePlanner.addCommand(CommandType.PAY_PORTION, [
    currencyOut,
    feeRecipient as string,
    INTERFACE_FEE_BIPS.toString(),
  ]);

  // Sweep remainder to msg.sender, enforcing minimum output
  routePlanner.addCommand(CommandType.SWEEP, [
    currencyOut,
    "0x0000000000000000000000000000000000000001", // MSG_SENDER sentinel
    amountOut.toString(),
  ]);

  return {
    commands: routePlanner.commands as `0x${string}`,
    inputs: routePlanner.inputs as `0x${string}`[],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n;
}

function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Swap tokens through Uniswap V4 via the Universal Router.
 *
 * @example
 * const { quote, swap, isPending } = useSwap({
 *   poolKey, zeroForOne: true, tradeType: 'exactIn',
 *   amount: parseUnits('1', 18), slippageBps: 50,
 * })
 */
export function useSwap(swapParams: UseSwapParams | null): UseSwapResult {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address: userAddress } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending, error: writeError, data: txHash } = useWriteContract();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const queryClient = useQueryClient();

  const enabled =
    Boolean(swapParams) &&
    Boolean(publicClient) &&
    isSupportedChainId(chainId) &&
    (swapParams?.amount ?? 0n) > 0n;

  // Quote query
  const quoteQuery = useQuery({
    queryKey: [
      "v4SwapQuote",
      swapParams?.poolKey,
      swapParams?.zeroForOne,
      swapParams?.tradeType,
      swapParams?.amount?.toString(),
      chainId,
    ],
    queryFn: async (): Promise<SwapQuote> => {
      if (!swapParams || !publicClient) throw new Error("Missing params");

      const { quoter } = getContracts(chainId as SupportedChainId);
      if (quoter === "0x0000000000000000000000000000000000000000") {
        throw new Error("V4Quoter not configured for this chain");
      }

      const quoterParams = {
        poolKey: {
          currency0: swapParams.poolKey.currency0,
          currency1: swapParams.poolKey.currency1,
          fee: swapParams.poolKey.fee,
          tickSpacing: swapParams.poolKey.tickSpacing,
          hooks: swapParams.poolKey.hooks,
        },
        zeroForOne: swapParams.zeroForOne,
        exactAmount: swapParams.amount,
        sqrtPriceLimitX96: 0n,
        hookData: "0x" as `0x${string}`,
      } as const;

      if (swapParams.tradeType === "exactIn") {
        const { result } = await publicClient.simulateContract({
          address: quoter as Address,
          abi: V4_QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [quoterParams],
        });
        const [amountOut, gasEstimate] = result as [bigint, bigint];
        return {
          amountIn: swapParams.amount,
          amountOut,
          gasEstimate,
          amountOutAfterFee: (amountOut * (10000n - INTERFACE_FEE_BIPS)) / 10000n,
          priceImpact: 0, // TODO: compute from reference price when available
        };
      } else {
        const { result } = await publicClient.simulateContract({
          address: quoter as Address,
          abi: V4_QUOTER_ABI,
          functionName: "quoteExactOutputSingle",
          args: [quoterParams],
        });
        const [amountIn, gasEstimate] = result as [bigint, bigint];
        return {
          amountIn,
          amountOut: swapParams.amount,
          gasEstimate,
          amountOutAfterFee: (swapParams.amount * (10000n - INTERFACE_FEE_BIPS)) / 10000n,
          priceImpact: 0,
        };
      }
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const currencyIn = swapParams
    ? (swapParams.zeroForOne ? swapParams.poolKey.currency0 : swapParams.poolKey.currency1)
    : undefined;

  // Permit2 allowance check — only for ERC20 tokens (not native ETH)
  const isNativeIn = currencyIn === "0x0000000000000000000000000000000000000000";
  const permit2AllowanceQuery = useQuery({
    queryKey: ["permit2Allowance", userAddress, currencyIn, chainId],
    queryFn: async () => {
      if (!publicClient || !userAddress || !currencyIn) return null;
      const { permit2, universalRouter } = getContracts(chainId as SupportedChainId);
      return publicClient.readContract({
        address: permit2 as Address,
        abi: PERMIT2_ABI,
        functionName: "allowance",
        args: [userAddress, currencyIn as Address, universalRouter as Address],
      }) as Promise<readonly [bigint, number, number]>;
    },
    enabled: enabled && !isNativeIn && Boolean(userAddress),
    staleTime: 30_000,
  });

  const [currentPermit2Amount] = permit2AllowanceQuery.data ?? [0n, 0, 0];
  const neededAmount = swapParams?.amount ?? 0n;
  const needsPermit2Approval = !isNativeIn && currentPermit2Amount < neededAmount;

  // ERC20 → Permit2 approval (on-chain, one-time per token)
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!currencyIn || !isSupportedChainId(chainId)) return;
      const { permit2 } = getContracts(chainId);
      await writeContractAsync({
        address: currencyIn as Address,
        abi: [
          {
            name: "approve",
            type: "function",
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
            stateMutability: "nonpayable",
          },
        ] as const,
        functionName: "approve",
        args: [permit2 as Address, 2n ** 256n - 1n],
      });
      await queryClient.invalidateQueries({ queryKey: ["permit2Allowance"] });
    },
  });

  // Main swap mutation
  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!swapParams || !publicClient || !userAddress) {
        throw new Error("Wallet not connected or missing swap params");
      }
      if (!isSupportedChainId(chainId)) throw new Error("Unsupported chain");

      const quote = quoteQuery.data;
      if (!quote) throw new Error("No quote available");

      const contracts = getContracts(chainId);
      const slippageBps = swapParams.slippageBps ?? 50;
      const deadline = swapParams.deadline ?? BigInt(Math.floor(Date.now() / 1000)) + 1800n;

      const amountIn =
        swapParams.tradeType === "exactIn"
          ? swapParams.amount
          : (quote.amountIn * BigInt(10000 + slippageBps)) / 10000n;

      const amountOutMin =
        swapParams.tradeType === "exactIn"
          ? applySlippage(quote.amountOut, slippageBps)
          : swapParams.amount;

      let permit2Arg: BuildSwapCalldataParams["permit2"] | undefined;

      if (!isNativeIn && currencyIn) {
        const [allowedAmount, , nonce] = await (publicClient.readContract({
          address: contracts.permit2 as Address,
          abi: PERMIT2_ABI,
          functionName: "allowance",
          args: [userAddress, currencyIn as Address, contracts.universalRouter as Address],
        }) as Promise<readonly [bigint, number, number]>);

        if (allowedAmount < amountIn) {
          const sigDeadline = deadline + 86400n;
          const expiration = Number(sigDeadline);

          const signature = await signTypedDataAsync({
            domain: {
              name: "Permit2",
              chainId,
              verifyingContract: contracts.permit2 as Address,
            },
            types: PERMIT2_TYPES,
            primaryType: "PermitSingle",
            message: {
              details: {
                token: currencyIn as Address,
                amount: MAX_UINT160,
                expiration,
                nonce,
              },
              spender: contracts.universalRouter as Address,
              sigDeadline,
            },
          });

          permit2Arg = {
            token: currencyIn as Address,
            spender: contracts.universalRouter as Address,
            amount: MAX_UINT160,
            expiration,
            nonce,
            sigDeadline,
            signature,
          };
        }
      }

      const { commands, inputs } = buildSwapCalldata({
        poolKey: swapParams.poolKey,
        zeroForOne: swapParams.zeroForOne,
        tradeType: swapParams.tradeType,
        amountIn,
        amountOut: amountOutMin,
        feeRecipient: env.NEXT_PUBLIC_FEE_RECIPIENT as Address,
        permit2: permit2Arg,
      });

      // Simulate before sending — surface revert reason early
      await publicClient.simulateContract({
        address: contracts.universalRouter as Address,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: "execute",
        args: [commands, [...inputs], deadline],
        value: isNativeIn ? amountIn : 0n,
        account: userAddress,
      });

      await writeContractAsync({
        address: contracts.universalRouter as Address,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: "execute",
        args: [commands, [...inputs], deadline],
        value: isNativeIn ? amountIn : 0n,
      });

      setIsConfirmed(true);
      await queryClient.invalidateQueries({ queryKey: ["positions"] });
      await queryClient.invalidateQueries({ queryKey: ["permit2Allowance"] });
    },
    onError: () => setIsConfirmed(false),
  });

  return {
    quote: quoteQuery.data ?? null,
    isQuoteLoading: quoteQuery.isLoading,
    quoteError: (quoteQuery.error as Error | null) ?? null,
    needsPermit2Approval,
    approvePermit2: () => approveMutation.mutate(),
    isApproving: approveMutation.isPending,
    swap: () => swapMutation.mutate(),
    isPending: isPending || swapMutation.isPending,
    isConfirmed,
    isError: swapMutation.isError,
    error: (swapMutation.error as Error | null) ?? (writeError as Error | null) ?? null,
    txHash,
  };
}
