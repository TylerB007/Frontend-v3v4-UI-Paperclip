import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, base, sepolia, baseSepolia } from "viem/chains";
import { env } from "@/lib/env";

export const wagmiConfig = getDefaultConfig({
  appName: "LP Mastery",
  projectId: env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  chains: [mainnet, base, sepolia, baseSepolia],
  ssr: true,
});
