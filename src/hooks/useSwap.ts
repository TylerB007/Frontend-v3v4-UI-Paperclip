"use client";

/**
 * useSwap — stub hook pending UNI-11 DeFi implementation.
 *
 * Contract: fetches a live quote from QuoterV2 and exposes a swap
 * mutation that routes through the Universal Router with:
 *   - v4Planner calldata construction (exact-input or exact-output)
 *   - Permit2 EIP-712 signature-based token approval
 *   - 20bps PAY_PORTION interface fee via NEXT_PUBLIC_OPERATOR_WALLET
 *
 * TODO(UNI-11): Replace this stub with the real implementation.
 */

export interface SwapQuote {
  /** Expected output amount (raw, before decimals). */
  amountOut: bigint;
  /** Price impact as a percentage (0–100). */
  priceImpact: number;
}

export interface UseSwapParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  /** Exact input amount (raw, before decimals). */
  amountIn: bigint;
  /** Slippage tolerance in basis points (e.g. 50 = 0.5%). */
  slippageBps: number;
  chainId: number;
}

export interface UseSwapResult {
  quote: SwapQuote | null;
  isQuoteLoading: boolean;
  quoteError: Error | null;
  /** True when Permit2 allowance must be set before swapping. */
  needsPermit2Approval: boolean;
  approvePermit2: () => void;
  isApproving: boolean;
  swap: () => void;
  isPending: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useSwap(_params: UseSwapParams | null): UseSwapResult {
  return {
    quote: null,
    isQuoteLoading: false,
    quoteError: null,
    needsPermit2Approval: false,
    approvePermit2: () => {},
    isApproving: false,
    swap: () => {},
    isPending: false,
    isConfirmed: false,
    isError: false,
    error: null,
    txHash: undefined,
  };
}
