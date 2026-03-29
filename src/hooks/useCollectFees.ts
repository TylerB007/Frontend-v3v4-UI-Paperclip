"use client";

/**
 * useCollectFees — stub hook pending UNI-11 DeFi implementation.
 *
 * Contract: reads accrued tokensOwed for a position and exposes a
 * collectFees mutation to claim them via PositionManager.collect().
 *
 * TODO(UNI-11): Replace this stub with the real implementation:
 *   - Read tokensOwed0 / tokensOwed1 from StateView or PositionManager
 *   - Call PositionManager.collect(tokenId, recipient, amount0Max, amount1Max)
 *   - Invalidate the usePositions query on success
 */

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useCollectFees(
  _tokenId: bigint,
  _chainId: number,
): UseCollectFeesResult {
  return {
    tokensOwed0: undefined,
    tokensOwed1: undefined,
    isLoadingOwed: false,
    collectFees: () => {},
    isPending: false,
    isConfirmed: false,
    isError: false,
    error: null,
    txHash: undefined,
  };
}
