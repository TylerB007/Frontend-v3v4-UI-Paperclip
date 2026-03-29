"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useModifyLiquidity, type UseModifyLiquidityParams } from "@/hooks/useModifyLiquidity";
import { TransactionToast } from "./TransactionToast";
import type { Position } from "@/hooks/usePositions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  symbol: string;
  decimals: number;
}

interface LiquidityActionsProps {
  isOpen: boolean;
  onClose: () => void;
  position: Position;
  token0: TokenInfo;
  token1: TokenInfo;
}

type Tab = "add" | "remove";

const REMOVE_PRESETS = [25, 50, 75, 100] as const;

const SLIPPAGE_OPTIONS = [
  { label: "0.5%", bps: 50 },
  { label: "1.0%", bps: 100 },
  { label: "2.0%", bps: 200 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Slide-in panel for adding or removing liquidity on an existing position.
 *
 * Add tab:
 *   - Token amount inputs for token0 and token1
 *   - Permit2 approval step when required
 *   - Liquidity delta preview from useModifyLiquidity
 *
 * Remove tab:
 *   - Percentage slider (1–100%) with quick-select presets
 *   - Slippage tolerance selector
 *   - Minimum amounts preview (slippage-adjusted)
 *   - Warning shown for large removals
 */
export function LiquidityActions({
  isOpen,
  onClose,
  position,
  token0,
  token1,
}: LiquidityActionsProps) {
  const [tab, setTab] = useState<Tab>("add");
  const [amount0Raw, setAmount0Raw] = useState("");
  const [amount1Raw, setAmount1Raw] = useState("");
  const [removePercent, setRemovePercent] = useState(50);
  const [slippageBps, setSlippageBps] = useState(50);
  const [showToast, setShowToast] = useState(false);

  const amount0Desired = parseAmount(amount0Raw, token0.decimals);
  const amount1Desired = parseAmount(amount1Raw, token1.decimals);

  // For remove: liquidityDelta = -(current liquidity * removePercent / 100)
  const removeLiquidityDelta =
    position.liquidity > 0n
      ? -(position.liquidity * BigInt(removePercent)) / 100n
      : 0n;

  // For add: pass sentinel 1n — the real delta is computed from desired amounts by UNI-11
  const addLiquidityDelta =
    amount0Desired > 0n || amount1Desired > 0n ? 1n : 0n;

  const modifyParams: UseModifyLiquidityParams | null =
    tab === "add"
      ? addLiquidityDelta > 0n
        ? {
            tokenId: position.tokenId,
            chainId: position.chainId,
            liquidityDelta: addLiquidityDelta,
            amount0Desired,
            amount1Desired,
            slippageBps,
          }
        : null
      : removeLiquidityDelta < 0n
        ? {
            tokenId: position.tokenId,
            chainId: position.chainId,
            liquidityDelta: removeLiquidityDelta,
            slippageBps,
          }
        : null;

  const {
    preview,
    isPreviewLoading,
    needsPermit2Approval,
    approvePermit2,
    isApproving,
    modifyLiquidity,
    isPending,
    isConfirmed,
    isError,
    error,
    txHash,
  } = useModifyLiquidity(modifyParams);

  const handleSubmit = () => {
    modifyLiquidity();
    setShowToast(true);
  };

  const showLargeRemovalWarning = tab === "remove" && removePercent >= 50;

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
        aria-label="Manage Liquidity"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-zinc-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Manage Liquidity</h2>
          <button
            onClick={onClose}
            aria-label="Close liquidity panel"
            className="rounded-md p-1 text-white/30 transition-colors hover:bg-white/8 hover:text-white/70"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8" role="tablist">
          {(["add", "remove"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                tab === t
                  ? "border-b-2 border-violet-500 text-white"
                  : "text-white/40 hover:text-white/70",
              )}
            >
              {t === "add" ? "Add Liquidity" : "Remove Liquidity"}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Position summary */}
          <div className="mb-4 rounded-lg bg-white/4 px-3 py-2">
            <p className="text-xs text-white/40">
              Position #{position.tokenId.toString()} · Tick{" "}
              {position.tickLower.toLocaleString()} →{" "}
              {position.tickUpper.toLocaleString()}
            </p>
          </div>

          {tab === "add" ? (
            <>
              {/* Token 0 input */}
              <div className="mb-3">
                <label
                  htmlFor="add-amount0"
                  className="mb-1.5 block text-xs text-white/40"
                >
                  {token0.symbol} amount
                </label>
                <input
                  id="add-amount0"
                  type="number"
                  min="0"
                  step="any"
                  value={amount0Raw}
                  onChange={(e) => setAmount0Raw(e.target.value)}
                  placeholder="0.0"
                  className="w-full rounded-xl border border-white/8 bg-black/30 px-4 py-2.5 text-right text-sm text-white placeholder:text-white/20 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Token 1 input */}
              <div className="mb-4">
                <label
                  htmlFor="add-amount1"
                  className="mb-1.5 block text-xs text-white/40"
                >
                  {token1.symbol} amount
                </label>
                <input
                  id="add-amount1"
                  type="number"
                  min="0"
                  step="any"
                  value={amount1Raw}
                  onChange={(e) => setAmount1Raw(e.target.value)}
                  placeholder="0.0"
                  className="w-full rounded-xl border border-white/8 bg-black/30 px-4 py-2.5 text-right text-sm text-white placeholder:text-white/20 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Permit2 approval for add */}
              {needsPermit2Approval && (
                <button
                  onClick={approvePermit2}
                  disabled={isApproving}
                  className="mb-3 w-full rounded-xl bg-amber-500/20 px-4 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
                >
                  {isApproving ? "Approving…" : "Approve tokens via Permit2"}
                </button>
              )}
            </>
          ) : (
            <>
              {/* Remove percentage slider */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="remove-slider" className="text-xs text-white/40">
                    Amount to remove
                  </label>
                  <span className="text-sm font-semibold text-white">{removePercent}%</span>
                </div>
                <input
                  id="remove-slider"
                  type="range"
                  min={1}
                  max={100}
                  value={removePercent}
                  onChange={(e) => setRemovePercent(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <div className="mt-2 flex gap-2">
                  {REMOVE_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setRemovePercent(pct)}
                      className={cn(
                        "flex-1 rounded-lg py-1 text-xs font-medium transition-colors",
                        removePercent === pct
                          ? "bg-violet-600 text-white"
                          : "bg-white/6 text-white/40 hover:bg-white/10 hover:text-white/70",
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Slippage for remove */}
              <div className="mb-4">
                <p className="mb-2 text-xs text-white/40">Slippage tolerance</p>
                <div className="flex gap-2">
                  {SLIPPAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.bps}
                      onClick={() => setSlippageBps(opt.bps)}
                      className={cn(
                        "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
                        slippageBps === opt.bps
                          ? "bg-violet-600 text-white"
                          : "bg-white/6 text-white/50 hover:bg-white/10 hover:text-white/80",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Large removal warning */}
              {showLargeRemovalWarning && (
                <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs text-amber-400">
                    Removing {removePercent}% of your liquidity. Ensure slippage
                    tolerance matches current market conditions.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Preview amounts */}
          {isPreviewLoading && (
            <div className="mb-4 rounded-lg bg-white/4 px-3 py-3 text-center">
              <span className="text-xs text-white/30">Calculating preview…</span>
            </div>
          )}

          {!isPreviewLoading && preview && (
            <div className="mb-4 space-y-1.5 rounded-lg bg-white/4 px-3 py-2">
              <p className="mb-1 text-xs text-white/40">
                {tab === "add" ? "Liquidity preview" : "You will receive (min)"}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">{token0.symbol}</span>
                <span className="font-mono text-xs font-medium text-white">
                  {formatAmount(preview.amount0, token0.decimals)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">{token1.symbol}</span>
                <span className="font-mono text-xs font-medium text-white">
                  {formatAmount(preview.amount1, token1.decimals)}
                </span>
              </div>
            </div>
          )}

          {/* Submit CTA */}
          <button
            onClick={handleSubmit}
            disabled={
              !modifyParams ||
              isPending ||
              (tab === "add" && needsPermit2Approval)
            }
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending
              ? tab === "add"
                ? "Adding liquidity…"
                : "Removing liquidity…"
              : tab === "add"
                ? "Add Liquidity"
                : "Remove Liquidity"}
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
          chainId={position.chainId}
          label={tab === "add" ? "Add liquidity" : "Remove liquidity"}
          onClose={() => setShowToast(false)}
        />
      )}
    </>
  );
}
