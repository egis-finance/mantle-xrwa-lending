/**
 * Contract addresses and chain bindings for hooks.
 *
 * Chain IDs sourced from lib/dynamic/chains (client module with 'use client').
 * This is safe because contracts is only imported by hooks, which are all
 * client components. No Server Components import this module.
 *
 * Address pattern: Environment vars with UNCONFIGURED_ADDRESS fallback. Hooks
 * check for UNCONFIGURED_ADDRESS and disable queries when contracts aren't
 * configured (e.g., test environment).
 *
 * Chain ID binding ensures each contract read routes to the correct RPC:
 * - Mantle: CollateralLocker, USDY
 * - Ethereum: Morpho, AcUSDY, NAVOracle, USDC, IRM, Adapter
 */
import { MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID } from '@/lib/dynamic/chains';

// Sentinel value indicating an unconfigured contract address (env var not set)
export const UNCONFIGURED_ADDRESS = '0x0' as const;

export const contracts = {
  collateralLocker: {
    address: (process.env.NEXT_PUBLIC_MANTLE_LOCKER ?? UNCONFIGURED_ADDRESS) as `0x${string}`,
    chainId: MANTLE_CHAIN_ID,
  },
  acUSDY: {
    address: (process.env.NEXT_PUBLIC_ETH_ACUSDY ?? UNCONFIGURED_ADDRESS) as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
  morpho: {
    address: (process.env.NEXT_PUBLIC_ETH_MORPHO ?? UNCONFIGURED_ADDRESS) as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
  navOracle: {
    address: (process.env.NEXT_PUBLIC_ETH_ORACLE ?? UNCONFIGURED_ADDRESS) as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
  usdc: {
    address: (process.env.NEXT_PUBLIC_ETH_USDC ?? UNCONFIGURED_ADDRESS) as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
  irm: {
    address: (process.env.NEXT_PUBLIC_ETH_IRM ?? UNCONFIGURED_ADDRESS) as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
  adapter: {
    address: (process.env.NEXT_PUBLIC_ETH_ADAPTER ?? UNCONFIGURED_ADDRESS) as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
  usdy: {
    address: (process.env.NEXT_PUBLIC_MANTLE_USDY ?? '0x5bE26527e817998A7206475496fDE1E68957c5A6') as `0x${string}`,
    chainId: MANTLE_CHAIN_ID,
  },
  // Morpho Bundler3 - mainnet address works on VTE fork
  bundler3: {
    address: '0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245' as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
  // EthereumGeneralAdapter1 - mainnet address works on VTE fork
  generalAdapter1: {
    address: '0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0' as `0x${string}`,
    chainId: ETHEREUM_CHAIN_ID,
  },
} as const;

// Re-export chain IDs for backward compatibility
export { MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID };
