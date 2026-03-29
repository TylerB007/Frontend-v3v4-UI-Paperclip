"use client";

import { useState, Component, type ErrorInfo, type ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PositionCard, type PositionData } from "@/components/dashboard/PositionCard";

const MOCK_POSITIONS: PositionData[] = [
  {
    id: "pos-1",
    poolPair: "ETH / USDC",
    tickLower: -887_272,
    tickUpper: 887_272,
    liquidity: "$12,450.00",
    feesEarned: "$84.32",
    pnlPercent: 6.7,
    network: "mainnet",
  },
  {
    id: "pos-2",
    poolPair: "WBTC / ETH",
    tickLower: -60_000,
    tickUpper: -40_000,
    liquidity: "$8,900.00",
    feesEarned: "$21.15",
    pnlPercent: -2.34,
    network: "mainnet",
  },
  {
    id: "pos-3",
    poolPair: "ETH / USDC",
    tickLower: -10_000,
    tickUpper: 10_000,
    liquidity: "$5,200.00",
    feesEarned: "$47.80",
    pnlPercent: 14.12,
    network: "base",
  },
];

type Network = "mainnet" | "base";

interface NetworkToggleProps {
  selected: Network;
  onChange: (network: Network) => void;
}

function NetworkToggle({ selected, onChange }: NetworkToggleProps) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-white/4 p-0.5">
      {(["mainnet", "base"] as Network[]).map((network) => (
        <button
          key={network}
          onClick={() => onChange(network)}
          className={
            selected === network
              ? "rounded-md bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors"
              : "rounded-md px-4 py-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white/80"
          }
        >
          {network === "mainnet" ? "Mainnet" : "Base"}
        </button>
      ))}
    </div>
  );
}

interface PositionListErrorBoundaryState {
  hasError: boolean;
}

class PositionListErrorBoundary extends Component<
  { children: ReactNode },
  PositionListErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PositionListErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PositionList error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <p className="text-sm text-red-400">Failed to load positions. Please refresh.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface PositionListProps {
  positions: PositionData[];
}

function PositionList({ positions }: PositionListProps) {
  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/4 p-10 text-center">
        <p className="text-sm text-white/40">No positions on this network.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {positions.map((position) => (
        <PositionCard key={position.id} position={position} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [selectedNetwork, setSelectedNetwork] = useState<Network>("mainnet");

  const filtered = MOCK_POSITIONS.filter((p) => p.network === selectedNetwork);

  return (
    <AppLayout>
      <div className="px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-white/40">
              Your Uniswap V4 concentrated liquidity positions
            </p>
          </div>
          <NetworkToggle selected={selectedNetwork} onChange={setSelectedNetwork} />
        </div>

        <PositionListErrorBoundary>
          <PositionList positions={filtered} />
        </PositionListErrorBoundary>
      </div>
    </AppLayout>
  );
}
