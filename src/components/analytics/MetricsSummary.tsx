"use client";

import { cn } from "@/lib/utils";
import { usePortfolioMetrics } from "@/hooks/usePortfolioMetrics";
import type { Position } from "@/hooks/usePositions";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-white/8 bg-white/4 p-4">
      <div className="mb-2 h-3 w-20 rounded bg-white/10" />
      <div className="mb-1 h-5 w-28 rounded bg-white/10" />
      <div className="h-3 w-14 rounded bg-white/10" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual metric card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  trendPositive?: boolean;
  className?: string;
}

function MetricCard({
  label,
  value,
  trend,
  trendPositive,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/8 bg-white/4 p-4 transition-colors hover:border-white/12 hover:bg-white/6",
        className,
      )}
    >
      <p className="mb-1.5 text-xs font-medium text-white/40">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
      {trend !== undefined && (
        <p
          className={cn(
            "mt-0.5 text-xs font-medium",
            trendPositive ? "text-emerald-400" : "text-red-400",
          )}
        >
          {trend}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stale badge
// ---------------------------------------------------------------------------

function StaleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Stale
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MetricsSummaryProps {
  positions: Position[];
  className?: string;
}

/**
 * Compact stats band showing portfolio-wide metrics:
 * TVL | Total Fees | Active Range % | Net P&L | Fee APR
 *
 * Consumes usePortfolioMetrics (UNI-16 data hook).
 * Shows loading skeletons while data fetches and a stale badge on error.
 */
export function MetricsSummary({ positions, className }: MetricsSummaryProps) {
  const { metrics, isLoading, isStale, error } = usePortfolioMetrics(positions);

  // No positions yet — render nothing to keep the UI clean
  if (positions.length === 0 && !isLoading) {
    return null;
  }

  if (isLoading && !metrics) {
    return (
      <div
        className={cn(
          "grid grid-cols-2 gap-3 xl:grid-cols-5",
          className,
        )}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3",
          className,
        )}
      >
        <p className="text-sm text-red-400">
          Metrics unavailable — subgraph may be down.
        </p>
      </div>
    );
  }

  const m = metrics!;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Stale indicator when data is older than refetch interval */}
      {(isStale || error) && (
        <div className="flex items-center justify-end">
          <StaleBadge />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard
          label="TVL"
          value={formatUsd(m.totalValueLockedUsd)}
        />
        <MetricCard
          label="Total Fees"
          value={formatUsd(m.totalFeesEarnedUsd)}
          trend={
            m.totalFeesEarnedUsd > 0
              ? `+${formatUsd(m.totalFeesEarnedUsd)}`
              : undefined
          }
          trendPositive
        />
        <MetricCard
          label="Active Range"
          value={`${m.activeRangePercent.toFixed(0)}%`}
          trend={
            m.activeRangePercent >= 50
              ? `${m.activeRangePercent.toFixed(0)}% in range`
              : `${m.activeRangePercent.toFixed(0)}% in range`
          }
          trendPositive={m.activeRangePercent >= 50}
        />
        <MetricCard
          label="Net P&L"
          value={formatUsd(m.netPnlUsd)}
          trend={formatPercent(
            m.totalValueLockedUsd > 0
              ? (m.netPnlUsd / m.totalValueLockedUsd) * 100
              : 0,
          )}
          trendPositive={m.netPnlUsd >= 0}
        />
        <MetricCard
          label="Fee APR"
          value={`${m.feeAprPercent.toFixed(2)}%`}
          trend={
            m.feeAprPercent > 0
              ? formatPercent(m.feeAprPercent)
              : undefined
          }
          trendPositive={m.feeAprPercent >= 0}
        />
      </div>
    </div>
  );
}
