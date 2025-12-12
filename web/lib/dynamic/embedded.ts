'use client';

import { useDynamicContext } from '@dynamic-labs/sdk-react-core';

interface EmbeddedWalletState {
  isReady: boolean;
  isCreating: boolean;
  hasWallet: boolean;
  error: Error | null;
}

/**
 * Hook to monitor embedded wallet setup status.
 * Use this to show loading states while the embedded wallet is being created.
 */
export function useEmbeddedWalletSetup(): EmbeddedWalletState {
  const { primaryWallet, sdkHasLoaded, user } = useDynamicContext();

  const hasWallet = !!primaryWallet;
  const isReady = sdkHasLoaded && hasWallet;
  const isCreating = sdkHasLoaded && !!user && !hasWallet;

  return {
    isReady,
    isCreating,
    hasWallet,
    error: null,
  };
}
