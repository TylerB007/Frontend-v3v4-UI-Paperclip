"use client";

import { useState } from "react";
import { usePoolMetadata } from "@/hooks/usePoolMetadata";
import type { Position } from "@/hooks/usePositions";
import { PositionCard, PositionCardSkeleton } from "./PositionCard";
import { CollectFeesButton } from "@/components/actions/CollectFeesButton";
import { SwapPanel } from "@/components/actions/SwapPanel";
import { LiquidityActions } from "@/components/actions/LiquidityActions";
import { PositionLogTable } from "@/components/analytics/PositionLogTable";

/** Format a raw V4 liquidity uint128 into a compact human-readable string. */
function formatLiquidity(liquidity: bigint): string {
  const n = Number(liquidity);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString();
}

interface LivePositionCardProps {
  position: Position;
  className?: string;
}

/**
 * Bridges a live Position (from usePositions) to the PositionCard display component.
 * Resolves pool metadata (token symbols, fee tier) via usePoolMetadata.
 * Shows action buttons for collecting fees, swapping, and managing liquidity.
 */
export function LivePositionCard({ position, className }: LivePositionCardProps) {
  const { data: meta, isLoading } = usePoolMetadata(position.poolKey, position.chainId);
  const [swapOpen, setSwapOpen] = useState(false);
  const [liquidityOpen, setLiquidityOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (isLoading || !meta) {
    return <PositionCardSkeleton className={className} />;
  }

  const token0 = {
    address: position.poolKey.currency0,
    symbol: meta.token0.symbol,
    decimals: meta.token0.decimals,
  };

  const token1 = {
    address: position.poolKey.currency1,
    symbol: meta.token1.symbol,
    decimals: meta.token1.decimals,
  };

  return (
    <>
      <div className={className}>
        <PositionCard
          position={{
            tokenId: position.tokenId.toString(),
            pairLabel: meta.pairLabel,
            feeTierLabel: meta.feeTierLabel,
            chainId: position.chainId,
            tickLower: position.tickLower,
            tickUpper: position.tickUpper,
            liquidityDisplay: formatLiquidity(position.liquidity),
          }}
        />

        {/* Action row */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <CollectFeesButton
            position={position}
            token0Symbol={meta.token0.symbol}
            token1Symbol={meta.token1.symbol}
            token0Decimals={meta.token0.decimals}
            token1Decimals={meta.token1.decimals}
          />

          <button
            onClick={() => setSwapOpen(true)}
            aria-label={`Swap tokens in ${meta.pairLabel} pool`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/25"
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
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
            Swap
          </button>

          <button
            onClick={() => setLiquidityOpen(true)}
            aria-label={`Manage liquidity for position #${position.tokenId.toString()}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/25"
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
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Liquidity
          </button>
        </div>

        {/* View History toggle */}
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          aria-expanded={historyOpen}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs font-medium text-white/50 transition-colors hover:border-white/12 hover:bg-white/5 hover:text-white/70"
        >
          <span>View History</span>
          <svg
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${historyOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expandable position history */}
        {historyOpen && (
          <div className="mt-2 border-t border-white/8 pt-3">
            <PositionLogTable
              tokenId={position.tokenId}
              chainId={position.chainId}
              token0Symbol={meta.token0.symbol}
              token1Symbol={meta.token1.symbol}
              token0Decimals={meta.token0.decimals}
              token1Decimals={meta.token1.decimals}
            />
          </div>
        )}
      </div>

      {/* Panels rendered outside the card to avoid z-index / overflow issues */}
      <SwapPanel
        isOpen={swapOpen}
        onClose={() => setSwapOpen(false)}
        chainId={position.chainId}
        poolKey={position.poolKey}
        token0={token0}
        token1={token1}
      />

      <LiquidityActions
        isOpen={liquidityOpen}
        onClose={() => setLiquidityOpen(false)}
        position={position}
        token0={{ symbol: meta.token0.symbol, decimals: meta.token0.decimals }}
        token1={{ symbol: meta.token1.symbol, decimals: meta.token1.decimals }}
      />
    </>
  );
}
