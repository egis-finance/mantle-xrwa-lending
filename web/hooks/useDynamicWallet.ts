/**
 * Primary wallet hook for Dynamic SDK, replacing wagmi's useAccount/useConnect.
 *
 * Returns:
 * - address, isConnected, isReady: Connection state
 * - chainId: Current network (normalized to number)
 * - publicClient, walletClient: viem clients for reads/writes
 * - connect(), switchNetwork(): Actions
 *
 * Chain ID handling: Dynamic's getNetwork() returns string | number depending
 * on the wallet provider. This hook normalizes to number for consistent comparison.
 *
 * Client fetching is async via useEffect - publicClient/walletClient may be
 * undefined briefly after connection until the promise resolves.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDynamicContext, useSwitchNetwork } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { PublicClient, WalletClient, Address } from 'viem';
import { normalizeChainId } from '@/lib/dynamic/chains';

interface DynamicWalletState {
  address: Address | undefined;
  isConnected: boolean;
  isReady: boolean;
  chainId: number | undefined;
  publicClient: PublicClient | undefined;
  walletClient: WalletClient | undefined;
  connect: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
}
export function useDynamicWallet(): DynamicWalletState {
  const { primaryWallet, setShowAuthFlow, sdkHasLoaded } = useDynamicContext();
  const switchNetworkFn = useSwitchNetwork();

  const [publicClient, setPublicClient] = useState<PublicClient | undefined>();
  const [walletClient, setWalletClient] = useState<WalletClient | undefined>();
  const [chainId, setChainId] = useState<number | undefined>();
  const [cachedWalletAddress, setCachedWalletAddress] = useState<Address | undefined>();

  // Fetch clients when wallet changes
  useEffect(() => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      return;
    }

    // Cancelled flag prevents state updates if component unmounts during async fetch
    let cancelled = false;
    const walletAddress = primaryWallet.address as Address | undefined;

    const fetchClients = async () => {
      try {
        const [pub, wallet] = await Promise.all([
          primaryWallet.getPublicClient(),
          primaryWallet.getWalletClient(),
        ]);

        // Get current chain ID from wallet
        const network = await primaryWallet.getNetwork();
        const normalizedChainId = normalizeChainId(network);

        if (cancelled) return;

        setPublicClient(pub as PublicClient);
        setWalletClient(wallet as WalletClient);
        setChainId(normalizedChainId);
        setCachedWalletAddress(walletAddress);
      } catch (error) {
        console.error('Failed to get wallet clients:', error);
      }
    };

    fetchClients();

    return () => {
      cancelled = true;
    };
  }, [primaryWallet]);

  const connect = useCallback(() => {
    setShowAuthFlow(true);
  }, [setShowAuthFlow]);

  const switchNetwork = useCallback(
    async (targetChainId: number) => {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        throw new Error('No Ethereum wallet connected');
      }
      await switchNetworkFn({ wallet: primaryWallet, network: targetChainId });
      setChainId(targetChainId);
    },
    [primaryWallet, switchNetworkFn]
  );

  const address = primaryWallet?.address as Address | undefined;
  const isConnected = !!primaryWallet;
  const isReady = sdkHasLoaded && isConnected;

  // cacheReady guards against stale data during wallet switches: ensures cached
  // clients match current wallet (type check + address identity check)
  const isActiveEthereumWallet = !!primaryWallet && isEthereumWallet(primaryWallet);
  const cacheReady = isActiveEthereumWallet && cachedWalletAddress === address;

  return {
    address,
    isConnected,
    isReady,
    chainId: cacheReady ? chainId : undefined,
    publicClient: cacheReady ? publicClient : undefined,
    walletClient: cacheReady ? walletClient : undefined,
    connect,
    switchNetwork,
  };
}
