'use client';

import { useCallback, useRef } from 'react';
import useSWR from 'swr';
import { getPublicClient } from '@/lib/swr/chains';
import type { ChainHealth, ConnectionStatus } from '@/lib/connection/types';
import { CONNECTION_THRESHOLDS } from '@/lib/connection/types';

interface UseRPCHealthResult {
  health: ChainHealth;
  refresh: () => void;
}

/**
 * Fetcher that calls eth_blockNumber on a specific chain.
 * Returns the block number or throws on failure.
 */
async function fetchBlockNumber(chainId: number): Promise<bigint> {
  const client = getPublicClient(chainId);
  if (!client) {
    throw new Error(`No client configured for chain ${chainId}`);
  }
  return client.getBlockNumber();
}

/**
 * Derives connection status from consecutive failure count.
 */
function deriveStatus(consecutiveFailures: number): ConnectionStatus {
  if (consecutiveFailures >= CONNECTION_THRESHOLDS.DISCONNECTED_THRESHOLD) {
    return 'disconnected';
  }
  if (consecutiveFailures >= CONNECTION_THRESHOLDS.RECONNECTING_THRESHOLD) {
    return 'reconnecting';
  }
  return 'connected';
}

/**
 * Hook for monitoring RPC health on a specific chain.
 * Polls eth_blockNumber every 5s and tracks consecutive failures.
 *
 * @param chainId - The chain ID to monitor
 * @param chainName - Human-readable chain name for display
 */
export function useRPCHealth(chainId: number, chainName: string): UseRPCHealthResult {
  // Track consecutive failures across renders
  const failureCountRef = useRef(0);
  const lastSeenRef = useRef<number | null>(null);

  const { data, error, mutate } = useSWR<bigint, Error>(
    `rpc-health:${chainId}`,
    () => fetchBlockNumber(chainId),
    {
      refreshInterval: CONNECTION_THRESHOLDS.POLL_INTERVAL,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      // Don't show loading state between polls
      keepPreviousData: true,
      // Custom error handling - don't use global SWR retry
      shouldRetryOnError: false,
      onSuccess: () => {
        // Reset failure count on success
        failureCountRef.current = 0;
        lastSeenRef.current = Date.now();
      },
      onError: () => {
        // Increment failure count on error
        failureCountRef.current += 1;
      },
    }
  );

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  // Build health state from SWR result and refs
  const consecutiveFailures = error ? failureCountRef.current : 0;
  const status = deriveStatus(consecutiveFailures);

  const health: ChainHealth = {
    chainId,
    chainName,
    status,
    blockNumber: data ?? null,
    lastSeen: lastSeenRef.current,
    consecutiveFailures,
    error: error ?? null,
  };

  return { health, refresh };
}
