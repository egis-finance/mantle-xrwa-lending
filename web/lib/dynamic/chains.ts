'use client';

import type { EvmNetwork } from '@dynamic-labs/sdk-react-core';
import { getEnv } from '@/lib/env';

const env = getEnv();

// VTE networks (Tenderly dashboard explorers)
export const mantleVTE: EvmNetwork = {
  blockExplorerUrls: env.explorer.mantleVte ? [env.explorer.mantleVte] : [],
  chainId: 15000,
  chainName: 'Mantle VTE',
  iconUrls: ['https://app.dynamic.xyz/assets/networks/mantle.svg'],
  name: 'Mantle VTE',
  nativeCurrency: { decimals: 18, name: 'MNT', symbol: 'MNT' },
  networkId: 15000,
  rpcUrls: [env.rpc.mantleVte],
  vanityName: 'Mantle VTE',
};

export const ethereumVTE: EvmNetwork = {
  blockExplorerUrls: env.explorer.ethereumVte ? [env.explorer.ethereumVte] : [],
  chainId: 10001,
  chainName: 'Ethereum VTE',
  iconUrls: ['https://app.dynamic.xyz/assets/networks/eth.svg'],
  name: 'Ethereum VTE',
  nativeCurrency: { decimals: 18, name: 'ETH', symbol: 'ETH' },
  networkId: 10001,
  rpcUrls: [env.rpc.ethereumVte],
  vanityName: 'Ethereum VTE',
};

// Mainnet networks
export const mantleMainnet: EvmNetwork = {
  blockExplorerUrls: [env.explorer.mantleMainnet],
  chainId: 5000,
  chainName: 'Mantle',
  iconUrls: ['https://app.dynamic.xyz/assets/networks/mantle.svg'],
  name: 'Mantle',
  nativeCurrency: { decimals: 18, name: 'MNT', symbol: 'MNT' },
  networkId: 5000,
  rpcUrls: [env.rpc.mantleMainnet],
  vanityName: 'Mantle',
};

export const ethereumMainnet: EvmNetwork = {
  blockExplorerUrls: [env.explorer.ethereumMainnet],
  chainId: 1,
  chainName: 'Ethereum',
  iconUrls: ['https://app.dynamic.xyz/assets/networks/eth.svg'],
  name: 'Ethereum',
  nativeCurrency: { decimals: 18, name: 'ETH', symbol: 'ETH' },
  networkId: 1,
  rpcUrls: [env.rpc.ethereumMainnet],
  vanityName: 'Ethereum',
};

// Env-scoped: Only expose VTE when USE_MAINNET=false (prevent accidental mainnet switch)
export const supportedNetworks: EvmNetwork[] = env.useMainnet
  ? [mantleMainnet, ethereumMainnet]
  : [mantleVTE, ethereumVTE];

// Chain ID constants (env-dependent)
export const MANTLE_CHAIN_ID = env.useMainnet ? 5000 : 15000;
export const ETHEREUM_CHAIN_ID = env.useMainnet ? 1 : 10001;

/**
 * Normalize Dynamic SDK's getNetwork() return value to a number.
 * Dynamic returns string | number | undefined depending on wallet state.
 */
export function normalizeChainId(network: string | number | undefined): number | undefined {
  if (network === undefined) return undefined;
  if (typeof network === 'string') {
    const parsed = parseInt(network, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return network;
}

/**
 * Get chain config by ID. Throws on unknown chainId (fail fast).
 */
export function getChainById(chainId: number): EvmNetwork {
  const chain = supportedNetworks.find((n) => n.chainId === chainId);
  if (!chain) {
    throw new Error(
      `Unknown chainId: ${chainId}. Supported: ${supportedNetworks.map((n) => n.chainId).join(', ')}`
    );
  }
  return chain;
}
