'use client';

// Re-export Dynamic SDK packages for centralized imports
export {
  DynamicContextProvider,
  useDynamicContext,
  useIsLoggedIn,
  useUserWallets,
  useSwitchNetwork,
  mergeNetworks,
  getAuthToken,
} from '@dynamic-labs/sdk-react-core';

export { DynamicWidget } from '@dynamic-labs/sdk-react-core';

export { EthereumWalletConnectors, isEthereumWallet } from '@dynamic-labs/ethereum';

// Re-export local chain utilities
export {
  supportedNetworks,
  MANTLE_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  getChainById,
  mantleVTE,
  ethereumVTE,
  mantleMainnet,
  ethereumMainnet,
} from './chains';

export { useEmbeddedWalletSetup } from './embedded';
