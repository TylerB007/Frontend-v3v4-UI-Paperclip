"use client";

/**
 * usePositions — live Uniswap V4 position state from on-chain reads.
 *
 * Data flow:
 *   1. usePositionIds   → tokenIds (from subgraph or getLogs, owned by Data Engineer)
 *   2. PositionManager.getPoolAndPositionInfo(tokenId) multicall
 *      → poolKey (currency0, currency1, fee, tickSpacing, hooks) + packed PositionInfo
 *   3. Decode PositionInfo bytes32 → tickLower, tickUpper
 *   4. StateView.getPositionInfo(poolId, positionManager, tickLower, tickUpper, salt) multicall
 *      → liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128
 *
 * All contract reads go through Viem multicall via the Wagmi publicClient.
 * State is managed by TanStack Query — no useEffect.
 */

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
} from "viem";
import { usePositionIds } from "@/hooks/usePositionIds";
import { getContracts, type SupportedChainId, SUPPORTED_CHAIN_IDS } from "@/config/contracts";
import { STATE_VIEW_ABI, POSITION_MANAGER_ABI } from "@/abis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface Position {
  tokenId: bigint;
  chainId: number;
  /** V4 PoolId: keccak256(abi.encode(poolKey)) */
  poolId: `0x${string}`;
  poolKey: PoolKey;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
}

export interface UsePositionsResult {
  positions: Position[];
  isLoading: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode a packed PositionInfo bytes32 into tickLower and tickUpper.
 *
 * Layout per PositionInfoLibrary.sol:
 *   - upper 200 bits (top 25 bytes): poolId (bytes25)
 *   - bits 32..55 (shr 32): tickUpper (int24, sign-extended)
 *   - bits  8..31 (shr  8): tickLower (int24, sign-extended)
 *   - bit       0          : hasSubscriber
 */
function decodePositionInfo(info: `0x${string}`): {
  tickLower: number;
  tickUpper: number;
} {
  const v = BigInt(info);

  const MASK_24 = BigInt(0xffffff);
  const SIGN_BIT_24 = BigInt(0x800000);
  const SIGN_EXT_24 = 0x1000000;

  const tlRaw = (v >> BigInt(8)) & MASK_24;
  const tickLower =
    tlRaw >= SIGN_BIT_24 ? Number(tlRaw) - SIGN_EXT_24 : Number(tlRaw);

  const tuRaw = (v >> BigInt(32)) & MASK_24;
  const tickUpper =
    tuRaw >= SIGN_BIT_24 ? Number(tuRaw) - SIGN_EXT_24 : Number(tuRaw);

  return { tickLower, tickUpper };
}

/**
 * Compute the V4 PoolId (bytes32) from a PoolKey.
 * Matches PoolIdLibrary.toId() in v4-core: keccak256(abi.encode(key)).
 */
function computePoolId(key: PoolKey): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks",
      ),
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

/**
 * Convert a tokenId to the salt used by the PositionManager when it registers
 * a position in the PoolManager.  In V4: salt = bytes32(tokenId).
 */
function tokenIdToSalt(tokenId: bigint): `0x${string}` {
  return `0x${tokenId.toString(16).padStart(64, "0")}`;
}

function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns live on-chain state for all Uniswap V4 positions held by a wallet.
 *
 * @param walletAddress - Connected wallet address; pass `undefined` when not connected.
 *
 * @example
 * const { positions, isLoading, error } = usePositions(address);
 */
export function usePositions(
  walletAddress: Address | undefined,
): UsePositionsResult {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });

  const {
    tokenIds,
    isLoading: idsLoading,
    error: idsError,
  } = usePositionIds(walletAddress);

  const query = useQuery({
    queryKey: [
      "positions",
      walletAddress?.toLowerCase(),
      chainId,
      tokenIds.map(String),
    ],
    queryFn: async (): Promise<Position[]> => {
      if (!publicClient || !walletAddress) return [];
      if (!isSupportedChainId(chainId)) return [];
      if (tokenIds.length === 0) return [];

      const contracts = getContracts(chainId);

      // -----------------------------------------------------------------------
      // Round 1: fetch PoolKey + packed PositionInfo for each tokenId
      // -----------------------------------------------------------------------
      const poolInfoResults = await publicClient.multicall({
        contracts: tokenIds.map((tokenId) => ({
          address: contracts.positionManager as Address,
          abi: POSITION_MANAGER_ABI,
          functionName: "getPoolAndPositionInfo",
          args: [tokenId],
        })),
        allowFailure: true,
      });

      type PoolInfoResult = readonly [
        {
          currency0: Address;
          currency1: Address;
          fee: number;
          tickSpacing: number;
          hooks: Address;
        },
        `0x${string}`,
      ];

      const validPositions: Array<{
        tokenId: bigint;
        poolKey: PoolKey;
        tickLower: number;
        tickUpper: number;
      }> = [];

      for (let i = 0; i < tokenIds.length; i++) {
        const r = poolInfoResults[i];
        if (r.status !== "success" || !r.result) continue;

        const [rawPoolKey, infoBytes] = r.result as PoolInfoResult;
        const poolKey: PoolKey = {
          currency0: rawPoolKey.currency0,
          currency1: rawPoolKey.currency1,
          fee: rawPoolKey.fee,
          tickSpacing: rawPoolKey.tickSpacing,
          hooks: rawPoolKey.hooks,
        };
        const { tickLower, tickUpper } = decodePositionInfo(infoBytes);
        validPositions.push({ tokenId: tokenIds[i], poolKey, tickLower, tickUpper });
      }

      if (validPositions.length === 0) return [];

      // -----------------------------------------------------------------------
      // Round 2: fetch live position state from StateView
      // -----------------------------------------------------------------------
      const stateViewResults = await publicClient.multicall({
        contracts: validPositions.map(({ tokenId, poolKey, tickLower, tickUpper }) => ({
          address: contracts.stateView as Address,
          abi: STATE_VIEW_ABI,
          functionName: "getPositionInfo",
          args: [
            computePoolId(poolKey),
            contracts.positionManager as Address,
            tickLower,
            tickUpper,
            tokenIdToSalt(tokenId),
          ],
        })),
        allowFailure: true,
      });

      type StateViewResult = readonly [bigint, bigint, bigint]; // [liquidity, fg0, fg1]

      const positions: Position[] = [];

      for (let i = 0; i < validPositions.length; i++) {
        const r = stateViewResults[i];
        if (r.status !== "success" || !r.result) continue;

        const [liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128] =
          r.result as StateViewResult;

        const { tokenId, poolKey, tickLower, tickUpper } = validPositions[i];
        positions.push({
          tokenId,
          chainId,
          poolId: computePoolId(poolKey),
          poolKey,
          tickLower,
          tickUpper,
          liquidity,
          feeGrowthInside0LastX128,
          feeGrowthInside1LastX128,
        });
      }

      return positions;
    },
    enabled: Boolean(walletAddress) && !idsLoading && Boolean(publicClient),
    staleTime: 15_000,
    refetchInterval: 30_000,
    // Keep previous data visible during refetch to avoid flash of empty state
    placeholderData: (prev) => prev,
  });

  return {
    positions: query.data ?? [],
    isLoading: idsLoading || query.isLoading,
    error: idsError ?? query.error ?? null,
  };
}
