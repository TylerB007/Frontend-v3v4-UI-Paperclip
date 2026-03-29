"use client";

/**
 * usePoolMetadata — resolve human-readable token pair and fee tier from a PoolKey.
 *
 * Given a PoolKey (from a Position returned by usePositions), fetches:
 *   - token0 / token1 symbol, name, decimals via ERC-20 multicall
 *   - formats the fee tier as a percentage string (e.g. "0.30%")
 *
 * Native ETH (address 0x000...000) is handled without a contract call.
 * Token metadata never changes so results are cached with staleTime: Infinity.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { erc20Abi, type Address } from "viem";
import type { PoolKey } from "@/hooks/usePositions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenMeta {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export interface PoolMetadata {
  token0: TokenMeta;
  token1: TokenMeta;
  /** Raw fee in hundredths of a bip (e.g. 3000 = 0.30%) */
  fee: number;
  tickSpacing: number;
  hooks: Address;
  /** Formatted fee string, e.g. "0.30%" */
  feeTierLabel: string;
  /** Human-readable pair label, e.g. "ETH / USDC" */
  pairLabel: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NATIVE_ETH_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const satisfies Address;

const NATIVE_ETH: TokenMeta = {
  address: NATIVE_ETH_ADDRESS,
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNativeEth(address: Address): boolean {
  return address.toLowerCase() === NATIVE_ETH_ADDRESS;
}

/** Convert a raw Uniswap fee (hundredths of a bip) to a percentage string. */
function formatFeeTier(fee: number): string {
  // fee 100 = 0.01%, 500 = 0.05%, 3000 = 0.30%, 10000 = 1.00%
  const pct = fee / 10_000;
  // Show up to 2 decimal places, trim trailing zeros
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

// ---------------------------------------------------------------------------
// Token metadata fetch (ERC-20 multicall)
// ---------------------------------------------------------------------------

async function fetchTokenMeta(
  address: Address,
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
): Promise<TokenMeta> {
  if (isNativeEth(address)) return NATIVE_ETH;

  const results = await publicClient.multicall({
    contracts: [
      { address, abi: erc20Abi, functionName: "symbol" },
      { address, abi: erc20Abi, functionName: "name" },
      { address, abi: erc20Abi, functionName: "decimals" },
    ],
    allowFailure: true,
  });

  const symbol =
    results[0].status === "success" && typeof results[0].result === "string"
      ? results[0].result
      : address.slice(0, 6);

  const name =
    results[1].status === "success" && typeof results[1].result === "string"
      ? results[1].result
      : symbol;

  const decimals =
    results[2].status === "success" && typeof results[2].result === "number"
      ? results[2].result
      : 18;

  return { address, symbol, name, decimals };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Resolves token metadata and fee tier info for a Uniswap V4 pool.
 *
 * @param poolKey - The PoolKey from a Position (currency0, currency1, fee, tickSpacing, hooks).
 *                  Pass `undefined` while the position is loading.
 * @param chainId - The chain ID for the Viem public client.
 *
 * @example
 * const { data: meta } = usePoolMetadata(position.poolKey, position.chainId);
 * // meta.pairLabel → "ETH / USDC"
 * // meta.feeTierLabel → "0.30%"
 */
export function usePoolMetadata(
  poolKey: PoolKey | undefined,
  chainId: number,
): UseQueryResult<PoolMetadata> {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: [
      "poolMetadata",
      poolKey?.currency0,
      poolKey?.currency1,
      poolKey?.fee,
      chainId,
    ],
    queryFn: async (): Promise<PoolMetadata> => {
      if (!poolKey) throw new Error("poolKey is required");
      if (!publicClient) throw new Error("No public client for chain " + chainId);

      const [token0, token1] = await Promise.all([
        fetchTokenMeta(poolKey.currency0, publicClient),
        fetchTokenMeta(poolKey.currency1, publicClient),
      ]);

      const feeTierLabel = formatFeeTier(poolKey.fee);
      const pairLabel = `${token0.symbol} / ${token1.symbol}`;

      return {
        token0,
        token1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
        feeTierLabel,
        pairLabel,
      };
    },
    enabled: Boolean(poolKey) && Boolean(publicClient),
    // Token metadata is immutable — cache indefinitely
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
