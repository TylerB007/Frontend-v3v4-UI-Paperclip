"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCollectFees } from "@/hooks/useCollectFees";
import { TransactionToast } from "./TransactionToast";
import type { Position } from "@/hooks/usePositions";

/** Format a raw bigint token amount for display (respects decimals). */
function formatTokenAmount(amount: bigint | undefined, decimals: number): string {
  if (amount === undefined) return "—";
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

interface CollectFeesButtonProps {
  position: Position;
  token0Symbol: string;
  token1Symbol: string;
  /** Decimals for token0 display (defaults to 18). */
  token0Decimals?: number;
  /** Decimals for token1 display (defaults to 18). */
  token1Decimals?: number;
}

/**
 * Per-position "Collect Fees" button.
 * Shows a confirmation modal with accrued token amounts before submitting.
 * Disabled when no fees are owed or the position is loading.
 */
export function CollectFeesButton({
  position,
  token0Symbol,
  token1Symbol,
  token0Decimals = 18,
  token1Decimals = 18,
}: CollectFeesButtonProps) {
  const { tokenId, chainId } = position;
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const {
    tokensOwed0,
    tokensOwed1,
    isLoadingOwed,
    collectFees,
    isPending,
    isConfirmed,
    isError,
    error,
    txHash,
  } = useCollectFees(position);

  const hasOwed =
    (tokensOwed0 !== undefined && tokensOwed0 > 0n) ||
    (tokensOwed1 !== undefined && tokensOwed1 > 0n);

  const isDisabled = isLoadingOwed || !hasOwed || isPending;

  const handleConfirm = () => {
    collectFees();
    setShowModal(false);
    setShowToast(true);
  };

  // Auto-hide toast after confirmation
  const handleToastClose = () => setShowToast(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={isDisabled}
        aria-label={`Collect fees for position #${tokenId.toString()}`}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
          hasOwed && !isLoadingOwed
            ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
            : "cursor-not-allowed bg-white/5 text-white/25",
        )}
      >
        {isLoadingOwed ? (
          <span
            className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/60"
            aria-label="Loading"
          />
        ) : (
          <svg
            className="h-3 w-3 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        {isPending ? "Collecting…" : "Collect Fees"}
      </button>

      {/* Pre-confirm modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="collect-fees-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <h2
              id="collect-fees-title"
              className="mb-1 text-base font-semibold text-white"
            >
              Collect Fees
            </h2>
            <p className="mb-5 text-xs text-white/40">
              Claim accumulated fees for position #{tokenId.toString()}
            </p>

            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
                <span className="text-sm text-white/60">{token0Symbol}</span>
                <span className="font-mono text-sm font-medium text-white">
                  {formatTokenAmount(tokensOwed0, token0Decimals)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
                <span className="text-sm text-white/60">{token1Symbol}</span>
                <span className="font-mono text-sm font-medium text-white">
                  {formatTokenAmount(tokensOwed1, token1Decimals)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl bg-white/8 px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/12 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction status toast */}
      {showToast && (
        <TransactionToast
          isPending={isPending}
          isConfirmed={isConfirmed}
          isError={isError}
          error={error}
          txHash={txHash}
          chainId={chainId}
          label="Collect fees"
          onClose={handleToastClose}
        />
      )}
    </>
  );
}
