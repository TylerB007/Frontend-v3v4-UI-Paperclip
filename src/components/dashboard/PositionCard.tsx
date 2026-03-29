import { cn } from "@/lib/utils";

export interface PositionData {
  id: string;
  poolPair: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  feesEarned: string;
  pnlPercent: number;
  network: "mainnet" | "base";
}

interface PositionCardProps {
  position: PositionData;
  className?: string;
}

function PnlBadge({ pnlPercent }: { pnlPercent: number }) {
  const isPositive = pnlPercent >= 0;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
        isPositive
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/15 text-red-400",
      )}
    >
      {isPositive ? "+" : ""}
      {pnlPercent.toFixed(2)}%
    </span>
  );
}

export function PositionCard({ position, className }: PositionCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/8 bg-white/4 p-5 transition-colors hover:border-white/12 hover:bg-white/6",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">{position.poolPair}</span>
          <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
            {position.network === "mainnet" ? "Mainnet" : "Base"}
          </span>
        </div>
        <PnlBadge pnlPercent={position.pnlPercent} />
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
          <p className="text-sm font-medium text-white">{position.liquidity}</p>
        </div>
        <div>
          <p className="mb-0.5 text-xs text-white/40">Fees Earned</p>
          <p className="text-sm font-medium text-emerald-400">{position.feesEarned}</p>
        </div>
      </div>
    </div>
  );
}
