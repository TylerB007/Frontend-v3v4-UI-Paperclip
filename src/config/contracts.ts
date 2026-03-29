/**
 * Uniswap V4 contract addresses by chain ID.
 * Source: https://docs.uniswap.org/contracts/v4/deployments
 *
 * All contract reads MUST go through StateView.
 * All swaps MUST route through the Universal Router.
 */

export const CONTRACT_ADDRESSES = {
  // Ethereum Mainnet
  1: {
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90" as const,
    positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9E" as const,
    stateView: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227" as const,
    universalRouter: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af" as const,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
  },
  // Base
  8453: {
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b" as const,
    positionManager: "0x7C5f5A4bBd8fD63184577525326123B519429bDc" as const,
    stateView: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71" as const,
    universalRouter: "0x6fF5693b99212Da76ad316178A184AB56D7b1b74" as const,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
  },
  // Sepolia (dev/testing)
  11155111: {
    poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543" as const,
    positionManager: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4" as const,
    stateView: "0xe7b96C2f7E6bEFb4B430F35E1e7E95e0dd0B8c8c" as const,
    universalRouter: "0x3A0D848D3EF86b8AC4193B5E7e4792e88B3aA700" as const,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
  },
  // Base Sepolia (dev/testing)
  84532: {
    poolManager: "0x05E73354cFDd6745C338b50BcFDEA13823B76B58" as const,
    positionManager: "0x4B2B777b86E39999bBC9e0e5dCd5f7e1f0C6A41" as const,
    stateView: "0x571291b572ed32ce6751a2Cb5486cD408d0A64e6" as const,
    universalRouter: "0x492E6456D9528a2a085571b3dF38Ea7F05081bAF" as const,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
  },
} as const;

export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;

export const SUPPORTED_CHAIN_IDS = [1, 8453] as const satisfies SupportedChainId[];

export function getContracts(chainId: SupportedChainId) {
  return CONTRACT_ADDRESSES[chainId];
}
