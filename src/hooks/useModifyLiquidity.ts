"use client";

/**
 * useModifyLiquidity — stub hook pending UNI-11 DeFi implementation.
 *
 * Contract: builds and submits PositionManager.modifyLiquidity() calls for
 * both add and remove liquidity, with:
 *   - Tick math: token amounts → liquidityDelta (add path)
 *   - Slippage-protected minimums: amount0Min / amount1Min (remove path)
 *   - Permit2 approval for both tokens on add
 *
 * Params guide:
 *   - Add liquidity:    set amount0Desired + amount1Desired; hook computes liquidityDelta
 *   - Remove liquidity: set liquidityDelta < 0 (e.g. -(liquidity * pct / 100n)); hook computes amounts
 *
 * TODO(UNI-11): Replace this stub with the real implementation.
 */

export interface LiquidityDeltaPreview {
  /** Estimated token0 amount involved in this liquidity change. */
  amount0: bigint;
  /** Estimated token1 amount involved in this liquidity change. */
  amount1: bigint;
  /** The computed liquidity delta (positive = add, negative = remove). */
  liquidityDelta: bigint;
}

export interface UseModifyLiquidityParams {
  tokenId: bigint;
  chainId: number;
  /**
   * Positive to add liquidity, negative to remove.
   * For add: pass 1n as a sentinel — hook derives real delta from amount0Desired/amount1Desired.
   * For remove: pass -(liquidity * removePercent / 100n).
   */
  liquidityDelta: bigint;
  /** For add liquidity: desired token0 input (raw, before decimals). */
  amount0Desired?: bigint;
  /** For add liquidity: desired token1 input (raw, before decimals). */
  amount1Desired?: bigint;
  /** Slippage tolerance for remove in basis points (e.g. 50 = 0.5%). */
  slippageBps?: number;
}

export interface UseModifyLiquidityResult {
  /** Estimated amounts involved; null until params are valid. */
  preview: LiquidityDeltaPreview | null;
  isPreviewLoading: boolean;
  /** True when Permit2 allowance must be set before adding. */
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useModifyLiquidity(
  _params: UseModifyLiquidityParams | null,
): UseModifyLiquidityResult {
  return {
    preview: null,
    isPreviewLoading: false,
    needsPermit2Approval: false,
    approvePermit2: () => {},
    isApproving: false,
    modifyLiquidity: () => {},
    isPending: false,
    isConfirmed: false,
    isError: false,
    error: null,
    txHash: undefined,
  };
}
