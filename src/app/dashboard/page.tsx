"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useAccount, useChainId } from "wagmi";
import { AppLayout } from "@/components/layout/AppLayout";
import { LivePositionCard } from "@/components/dashboard/LivePositionCard";
import { PositionCardSkeleton } from "@/components/dashboard/PositionCard";
import { usePositions } from "@/hooks/usePositions";
import { SUPPORTED_CHAIN_IDS } from "@/config/contracts";

// ---------------------------------------------------------------------------
// Network indicator
// ---------------------------------------------------------------------------

const CHAIN_LABELS: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  11155111: "Sepolia",
  84532: "Base Sepolia",
};

function NetworkIndicator({ chainId }: { chainId: number }) {
  const label = CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
  const isSupported = (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="text-xs font-medium text-red-400">
          Unsupported network: {label} — switch to Mainnet or Base
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      <span className="text-xs font-medium text-white/60">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
}

class PositionListErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
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

// ---------------------------------------------------------------------------
// Position list (live data)
// ---------------------------------------------------------------------------

function PositionListContent() {
  const { address } = useAccount();
  const { positions, isLoading, error } = usePositions(address);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <PositionCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center">
        <p className="mb-1 text-sm font-medium text-red-400">Error loading positions</p>
        <p className="text-xs text-red-400/60">{error.message}</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/4 p-10 text-center">
        <p className="mb-2 text-sm font-medium text-white/60">No positions found</p>
        <p className="mb-5 text-xs text-white/30">
          You have no Uniswap V4 positions on this network.
        </p>
        <a
          href="/actions"
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
        >
          Open a position
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {positions.map((position) => (
        <LivePositionCard key={position.tokenId.toString()} position={position} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center px-8 py-8">
          <div className="text-center">
            <p className="mb-2 text-base font-semibold text-white">Connect your wallet</p>
            <p className="text-sm text-white/40">
              Connect a wallet to view your Uniswap V4 positions.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

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
          <NetworkIndicator chainId={chainId} />
        </div>

        <PositionListErrorBoundary>
          <PositionListContent />
        </PositionListErrorBoundary>
      </div>
    </AppLayout>
  );
}
