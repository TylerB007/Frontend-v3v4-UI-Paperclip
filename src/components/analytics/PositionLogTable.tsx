"use client";

import { cn } from "@/lib/utils";
import {
  usePositionHistory,
  type PositionEvent,
  type PositionEventKind,
} from "@/hooks/usePositionHistory";

// ---------------------------------------------------------------------------
// Chain explorer helpers
// ---------------------------------------------------------------------------

const EXPLORER_TX_URLS: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  8453: "https://basescan.org/tx/",
  11155111: "https://sepolia.etherscan.io/tx/",
  84532: "https://sepolia.basescan.org/tx/",
};

function getTxUrl(txHash: string, chainId: number): string {
  const base = EXPLORER_TX_URLS[chainId] ?? "https://etherscan.io/tx/";
  return `${base}${txHash}`;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "—";
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${fracStr}`;
}

function formatLiquidityDelta(delta: bigint): string {
  if (delta === 0n) return "—";
  const sign = delta > 0n ? "+" : "";
  const abs = delta < 0n ? -delta : delta;
  if (abs >= 1_000_000_000n) return `${sign}${(Number(delta) / 1e9).toFixed(2)}B`;
  if (abs >= 1_000_000n) return `${sign}${(Number(delta) / 1e6).toFixed(2)}M`;
  if (abs >= 1_000n) return `${sign}${(Number(delta) / 1e3).toFixed(2)}K`;
  return `${sign}${delta.toLocaleString()}`;
}

function shortenTxHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function buildCsv(
  events: PositionEvent[],
  token0Symbol: string,
  token1Symbol: string,
  token0Decimals: number,
  token1Decimals: number,
): string {
  const headers = [
    "Date",
    "Event",
    `Amount0 (${token0Symbol})`,
    `Amount1 (${token1Symbol})`,
    "Liquidity Delta",
    "Block",
    "Tx Hash",
  ];

  const rows = events.map((e) => [
    formatTimestamp(e.timestamp),
    e.event,
    formatAmount(e.amount0, token0Decimals),
    formatAmount(e.amount1, token1Decimals),
    e.liquidityDelta.toString(),
    e.blockNumber.toString(),
    e.txHash,
  ]);

  const escape = (cell: string) =>
    `"${cell.replace(/"/g, '""')}"`;

  return [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ].join("\n");
}

function downloadCsv(csv: string, tokenId: bigint): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `position-${tokenId.toString()}-log.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Event badge
// ---------------------------------------------------------------------------

const EVENT_BADGE_STYLES: Record<PositionEventKind, string> = {
  IncreaseLiquidity:
    "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  DecreaseLiquidity:
    "bg-red-500/15 text-red-400 border border-red-500/25",
  Collect:
    "bg-blue-500/15 text-blue-400 border border-blue-500/25",
};

const EVENT_LABELS: Record<PositionEventKind, string> = {
  IncreaseLiquidity: "Add",
  DecreaseLiquidity: "Remove",
  Collect: "Collect",
};

function EventBadge({ kind }: { kind: PositionEventKind }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        EVENT_BADGE_STYLES[kind],
      )}
    >
      {EVENT_LABELS[kind]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty + loading states
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-white/6 bg-white/4 px-4 py-3"
        >
          <div className="h-3 w-24 rounded bg-white/10" />
          <div className="h-5 w-16 rounded bg-white/10" />
          <div className="ml-auto h-3 w-20 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-white/8 bg-white/4 py-8 text-center">
      <p className="text-sm text-white/40">No position history found.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PositionLogTableProps {
  tokenId: bigint;
  chainId: number;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Decimals?: number;
  token1Decimals?: number;
  className?: string;
}

/**
 * Per-position event history table.
 *
 * Columns: Date | Event | Amount0 | Amount1 | Liquidity Δ | Tx
 *
 * Features:
 * - Event badges: IncreaseLiquidity (green), DecreaseLiquidity (red), Collect (blue)
 * - Clickable Tx column → block explorer link
 * - Pagination: shows 20 rows, "Load More" appends next page
 * - CSV export: downloads all rows as `position-{tokenId}-log.csv`
 *
 * Consumes usePositionHistory (UNI-16 data hook).
 */
export function PositionLogTable({
  tokenId,
  chainId,
  token0Symbol = "Token0",
  token1Symbol = "Token1",
  token0Decimals = 18,
  token1Decimals = 18,
  className,
}: PositionLogTableProps) {
  const { events, loadMore, hasMore, isLoading, isFetchingMore, error } =
    usePositionHistory(tokenId, chainId);

  function handleExportCsv() {
    if (events.length === 0) return;
    const csv = buildCsv(
      events,
      token0Symbol,
      token1Symbol,
      token0Decimals,
      token1Decimals,
    );
    downloadCsv(csv, tokenId);
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/60">Position History</p>
        <button
          onClick={handleExportCsv}
          disabled={events.length === 0}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors",
            events.length > 0
              ? "hover:border-white/20 hover:bg-white/8 hover:text-white"
              : "cursor-not-allowed opacity-40",
          )}
        >
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
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">
            Failed to load history: {error.message}
          </p>
        </div>
      ) : events.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-white/40">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-white/40">
                    Event
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-white/40">
                    {token0Symbol}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-white/40">
                    {token1Symbol}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-white/40">
                    Liquidity Δ
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-white/40">
                    Tx
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {events.map((e) => (
                  <tr
                    key={e.txHash}
                    className="transition-colors hover:bg-white/3"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-white/50">
                      {formatTimestamp(e.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <EventBadge kind={e.event} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">
                      {formatAmount(e.amount0, token0Decimals)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">
                      {formatAmount(e.amount1, token1Decimals)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-mono text-xs",
                        e.liquidityDelta > 0n
                          ? "text-emerald-400"
                          : e.liquidityDelta < 0n
                            ? "text-red-400"
                            : "text-white/40",
                      )}
                    >
                      {formatLiquidityDelta(e.liquidityDelta)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={getTxUrl(e.txHash, chainId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-violet-400 transition-colors hover:text-violet-300"
                        title={e.txHash}
                      >
                        {shortenTxHash(e.txHash)}
                        <span className="ml-1 opacity-60">↗</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {hasMore && (
            <div className="flex justify-center pt-1">
              <button
                onClick={loadMore}
                disabled={isFetchingMore}
                className="rounded-lg border border-white/10 bg-white/4 px-4 py-2 text-xs font-medium text-white/60 transition-colors hover:border-white/20 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFetchingMore ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
