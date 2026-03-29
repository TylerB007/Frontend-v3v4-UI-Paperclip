"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useSwap, type UseSwapParams } from "@/hooks/useSwap";
import { TransactionToast } from "./TransactionToast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a decimal string into a raw bigint (scaled by token decimals). */
function parseAmount(value: string, decimals: number): bigint {
  if (!value || value === "." || isNaN(Number(value))) return 0n;
  try {
    const [whole = "0", frac = ""] = value.split(".");
    const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  } catch {
    return 0n;
  }
}

/** Format a raw bigint back to a decimal string for display. */
function formatAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}

const SLIPPAGE_OPTIONS = [
  { label: "0.1%", bps: 10 },
  { label: "0.5%", bps: 50 },
  { label: "1.0%", bps: 100 },
] as const;

interface SwapPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  /** The pool's token0. Pre-populated as the default "you pay" token. */
  token0: TokenInfo;
  /** The pool's token1. Pre-populated as the default "you receive" token. */
  token1: TokenInfo;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Slide-in swap panel anchored to the right edge of the viewport.
 * Allows swapping between the two tokens in the selected pool, with:
 *   - Live quote display and price impact indicator
 *   - Adjustable slippage (0.1% / 0.5% / 1.0% / custom)
 *   - Permit2 approval step when required
 *   - Transaction status toast
 */
export function SwapPanel({ isOpen, onClose, chainId, token0, token1 }: SwapPanelProps) {
  const [tokenIn, setTokenIn] = useState<TokenInfo>(token0);
  const [tokenOut, setTokenOut] = useState<TokenInfo>(token1);
  const [amountInRaw, setAmountInRaw] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showCustomSlippage, setShowCustomSlippage] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleFlip = useCallback(() => {
    setTokenIn((prev) => (prev === token0 ? token1 : token0));
    setTokenOut((prev) => (prev === token1 ? token0 : token1));
    setAmountInRaw("");
  }, [token0, token1]);

  const amountIn = parseAmount(amountInRaw, tokenIn.decimals);

  const swapParams: UseSwapParams | null =
    amountIn > 0n
      ? { tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, slippageBps, chainId }
      : null;

  const {
    quote,
    isQuoteLoading,
    quoteError,
    needsPermit2Approval,
    approvePermit2,
    isApproving,
    swap,
    isPending,
    isConfirmed,
    isError,
    error,
    txHash,
  } = useSwap(swapParams);

  const handleSwap = () => {
    swap();
    setShowToast(true);
  };

  const chainLabel =
    chainId === 1 ? "Mainnet" : chainId === 8453 ? "Base" : `Chain ${chainId}`;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Side panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Swap"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-zinc-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Swap</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">Connected to</span>
            <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
              {chainLabel}
            </span>
            <button
              onClick={onClose}
              aria-label="Close swap panel"
              className="rounded-md p-1 text-white/30 transition-colors hover:bg-white/8 hover:text-white/70"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Token In */}
          <div className="mb-1">
            <label className="mb-1.5 block text-xs text-white/40">You pay</label>
            <div className="rounded-xl border border-white/8 bg-black/30 p-3">
              <div className="flex items-center gap-3">
                <span className="shrink-0 rounded-lg bg-white/8 px-3 py-1.5 text-sm font-medium text-white">
                  {tokenIn.symbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amountInRaw}
                  onChange={(e) => setAmountInRaw(e.target.value)}
                  placeholder="0.0"
                  aria-label={`Amount of ${tokenIn.symbol} to pay`}
                  className="flex-1 bg-transparent text-right text-lg font-medium text-white placeholder:text-white/20 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center py-2">
            <button
              onClick={handleFlip}
              aria-label="Flip swap direction"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-zinc-800 text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Token Out */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs text-white/40">You receive</label>
            <div className="rounded-xl border border-white/8 bg-black/30 p-3">
              <div className="flex items-center gap-3">
                <span className="shrink-0 rounded-lg bg-white/8 px-3 py-1.5 text-sm font-medium text-white">
                  {tokenOut.symbol}
                </span>
                <div className="flex-1 text-right">
                  {isQuoteLoading ? (
                    <span className="text-sm text-white/30">Loading…</span>
                  ) : quote ? (
                    <span className="text-lg font-medium text-white">
                      {formatAmount(quote.amountOut, tokenOut.decimals)}
                    </span>
                  ) : (
                    <span className="text-lg font-medium text-white/20">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Price impact */}
          {quote && (
            <div className="mb-4 rounded-lg bg-white/4 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Price impact</span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    quote.priceImpact > 5
                      ? "text-red-400"
                      : quote.priceImpact > 1
                        ? "text-amber-400"
                        : "text-emerald-400",
                  )}
                >
                  {quote.priceImpact.toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          {/* Quote error */}
          {quoteError && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <p className="text-xs text-red-400">{quoteError.message}</p>
            </div>
          )}

          {/* Slippage settings */}
          <div className="mb-5">
            <p className="mb-2 text-xs text-white/40">Slippage tolerance</p>
            <div className="flex gap-2">
              {SLIPPAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.bps}
                  onClick={() => {
                    setSlippageBps(opt.bps);
                    setShowCustomSlippage(false);
                  }}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
                    slippageBps === opt.bps && !showCustomSlippage
                      ? "bg-violet-600 text-white"
                      : "bg-white/6 text-white/50 hover:bg-white/10 hover:text-white/80",
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setShowCustomSlippage(true)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
                  showCustomSlippage
                    ? "bg-violet-600 text-white"
                    : "bg-white/6 text-white/50 hover:bg-white/10 hover:text-white/80",
                )}
              >
                Custom
              </button>
            </div>

            {showCustomSlippage && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0.01"
                  max="50"
                  step="0.1"
                  value={customSlippage}
                  onChange={(e) => {
                    setCustomSlippage(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0) {
                      setSlippageBps(Math.round(val * 100));
                    }
                  }}
                  placeholder="0.5"
                  aria-label="Custom slippage percentage"
                  className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-right text-sm text-white placeholder:text-white/20 focus:border-violet-500 focus:outline-none"
                />
                <span className="text-sm text-white/40">%</span>
              </div>
            )}
          </div>

          {/* Permit2 approval (when required) */}
          {needsPermit2Approval && (
            <button
              onClick={approvePermit2}
              disabled={isApproving}
              className="mb-3 w-full rounded-xl bg-amber-500/20 px-4 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
            >
              {isApproving ? "Approving…" : `Approve ${tokenIn.symbol} via Permit2`}
            </button>
          )}

          {/* Swap CTA */}
          <button
            onClick={handleSwap}
            disabled={!quote || needsPermit2Approval || isPending || amountIn === 0n}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Swapping…" : "Swap"}
          </button>
        </div>
      </div>

      {/* Transaction toast */}
      {showToast && (
        <TransactionToast
          isPending={isPending}
          isConfirmed={isConfirmed}
          isError={isError}
          error={error}
          txHash={txHash}
          chainId={chainId}
          label="Swap"
          onClose={() => setShowToast(false)}
        />
      )}
    </>
  );
}
