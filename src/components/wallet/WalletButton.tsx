"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useChains } from "wagmi";
import { cn } from "@/lib/utils";

interface WalletButtonProps {
  className?: string;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton({ className }: WalletButtonProps) {
  const { openConnectModal } = useConnectModal();
  const { address, isConnected, isConnecting, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const chains = useChains();

  const isWrongNetwork = isConnected && chain && !chains.some((c) => c.id === chain.id);

  if (!isConnected) {
    return (
      <button
        onClick={openConnectModal}
        disabled={isConnecting}
        className={cn(
          "w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors",
          "hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  if (isWrongNetwork) {
    return (
      <button
        onClick={() => disconnect()}
        className={cn(
          "w-full rounded-lg bg-red-600/20 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors",
          "hover:bg-red-600/30",
          className,
        )}
      >
        Wrong Network — Disconnect
      </button>
    );
  }

  return (
    <button
      onClick={() => disconnect()}
      className={cn(
        "group w-full rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors",
        "hover:bg-white/10 hover:text-white",
        className,
      )}
      title="Click to disconnect"
    >
      <span className="block truncate group-hover:hidden">
        {address ? truncateAddress(address) : "Connected"}
      </span>
      <span className="hidden truncate text-red-400 group-hover:block">Disconnect</span>
    </button>
  );
}
