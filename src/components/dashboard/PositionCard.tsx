import { cn } from "@/lib/utils";

export interface PositionData {
  tokenId: string;
  pairLabel: string;
  feeTierLabel: string;
  chainId: number;
  tickLower: number;
  tickUpper: number;
  liquidityDisplay: string;
}

interface PositionCardProps {
  position: PositionData;
  className?: string;
}

const CHAIN_LABELS: Record<number, string> = {
  1: "Mainnet",
  8453: "Base",
  11155111: "Sepolia",
  84532: "Base Sepolia",
};

export function PositionCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl border border-white/8 bg-white/4 p-5",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-5 w-28 rounded bg-white/10" />
          <div className="h-5 w-14 rounded bg-white/10" />
        </div>
        <div className="h-5 w-12 rounded bg-white/10" />
      </div>
      <div className="mb-4 rounded-lg bg-black/20 px-3 py-2">
        <div className="mb-1 h-3 w-16 rounded bg-white/10" />
        <div className="h-4 w-36 rounded bg-white/10" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 h-3 w-14 rounded bg-white/10" />
          <div className="h-4 w-20 rounded bg-white/10" />
        </div>
        <div>
          <div className="mb-1 h-3 w-14 rounded bg-white/10" />
          <div className="h-4 w-20 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function PositionCard({ position, className }: PositionCardProps) {
  const chainLabel = CHAIN_LABELS[position.chainId] ?? `Chain ${position.chainId}`;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/8 bg-white/4 p-5 transition-colors hover:border-white/12 hover:bg-white/6",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">{position.pairLabel}</span>
          <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
            {chainLabel}
          </span>
        </div>
        <span className="rounded-md bg-white/8 px-2 py-0.5 text-xs font-medium text-white/50">
          {position.feeTierLabel}
        </span>
      </div>

      <div className="mb-4 rounded-lg bg-black/20 px-3 py-2">
        <p className="mb-0.5 text-xs text-white/40">Tick Range</p>
        <p className="font-mono text-sm text-white/70">
          {position.tickLower.toLocaleString()} → {position.tickUpper.toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-0.5 text-xs text-white/40">Liquidity</p>
          <p className="text-sm font-medium text-white">{position.liquidityDisplay}</p>
        </div>
        <div>
          <p className="mb-0.5 text-xs text-white/40">Token ID</p>
          <p className="font-mono text-sm font-medium text-white/60">#{position.tokenId}</p>
        </div>
      </div>
    </div>
  );
}
