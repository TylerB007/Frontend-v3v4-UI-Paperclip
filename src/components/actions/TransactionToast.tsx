"use client";

import { cn } from "@/lib/utils";

const EXPLORER_TX_BASE: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  8453: "https://basescan.org/tx/",
  11155111: "https://sepolia.etherscan.io/tx/",
  84532: "https://sepolia.basescan.org/tx/",
};

interface TransactionToastProps {
  isPending: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
  chainId: number;
  /** Short label for the action, e.g. "Swap" or "Collect fees". */
  label?: string;
  onClose: () => void;
}

/**
 * Floating toast shown at the bottom-right of the viewport during a transaction.
 * Renders nothing when all state flags are false.
 */
export function TransactionToast({
  isPending,
  isConfirmed,
  isError,
  error,
  txHash,
  chainId,
  label = "Transaction",
  onClose,
}: TransactionToastProps) {
  if (!isPending && !isConfirmed && !isError) return null;

  const explorerBase = EXPLORER_TX_BASE[chainId];
  const explorerUrl = explorerBase && txHash ? `${explorerBase}${txHash}` : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-[60] w-80 rounded-xl border shadow-2xl",
        isPending && "border-white/10 bg-zinc-900",
        isConfirmed && "border-emerald-500/20 bg-zinc-900",
        isError && "border-red-500/20 bg-zinc-900",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Status icon */}
        {isPending && (
          <div className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" />
        )}
        {isConfirmed && (
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
            <svg
              className="h-3 w-3 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
        {isError && (
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20">
            <svg
              className="h-3 w-3 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        )}

        {/* Message */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            {isPending
              ? `${label} pending…`
              : isConfirmed
                ? `${label} confirmed`
                : `${label} failed`}
          </p>
          {isPending && (
            <p className="mt-0.5 text-xs text-white/40">Waiting for confirmation</p>
          )}
          {isConfirmed && explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-xs text-violet-400 underline hover:text-violet-300"
            >
              View on explorer ↗
            </a>
          )}
          {isError && error && (
            <p className="mt-0.5 break-words text-xs text-red-400/70">
              {error.message.slice(0, 140)}
            </p>
          )}
        </div>

        {/* Dismiss button (only after terminal states) */}
        {(isConfirmed || isError) && (
          <button
            onClick={onClose}
            aria-label="Dismiss"
            className="mt-0.5 shrink-0 rounded p-0.5 text-white/30 transition-colors hover:bg-white/8 hover:text-white/60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
