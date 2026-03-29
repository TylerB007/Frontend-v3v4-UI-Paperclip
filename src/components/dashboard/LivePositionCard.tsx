"use client";

import { usePoolMetadata } from "@/hooks/usePoolMetadata";
import type { Position } from "@/hooks/usePositions";
import { PositionCard, PositionCardSkeleton } from "./PositionCard";

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
 * Shows a skeleton while metadata is loading.
 */
export function LivePositionCard({ position, className }: LivePositionCardProps) {
  const { data: meta, isLoading } = usePoolMetadata(position.poolKey, position.chainId);

  if (isLoading || !meta) {
    return <PositionCardSkeleton className={className} />;
  }

  return (
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
      className={className}
    />
  );
}
