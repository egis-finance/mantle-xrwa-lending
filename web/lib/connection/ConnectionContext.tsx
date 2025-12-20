'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ConnectionState, ChainHealth, ConnectionStatus } from './types';
import { useRPCHealth } from '@/hooks/useRPCHealth';
import { MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID } from '@/lib/dynamic/chains';

interface ConnectionContextValue extends ConnectionState {
  /** Trigger manual refresh of all chain health */
  refresh: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

interface ConnectionProviderProps {
  children: ReactNode;
}

/**
 * Derives overall status from individual chain states.
 * Uses worst-case: if any chain is disconnected, overall is disconnected.
 */
function deriveOverallStatus(chains: Record<number, ChainHealth>): ConnectionStatus {
  const statuses = Object.values(chains).map((c) => c.status);

  if (statuses.includes('disconnected')) return 'disconnected';
  if (statuses.includes('reconnecting')) return 'reconnecting';
  return 'connected';
}

/**
 * Provider for global connection state across monitored chains.
 * Polls eth_blockNumber on each chain to determine RPC health.
 */
export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const mantleHealth = useRPCHealth(MANTLE_CHAIN_ID, 'Mantle');
  const ethereumHealth = useRPCHealth(ETHEREUM_CHAIN_ID, 'Ethereum');

  const chains = useMemo(
    () => ({
      [MANTLE_CHAIN_ID]: mantleHealth.health,
      [ETHEREUM_CHAIN_ID]: ethereumHealth.health,
    }),
    [mantleHealth.health, ethereumHealth.health]
  );

  const overallStatus = useMemo(() => deriveOverallStatus(chains), [chains]);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      overallStatus,
      chains,
      isDegraded: overallStatus !== 'connected',
      refresh: () => {
        mantleHealth.refresh();
        ethereumHealth.refresh();
      },
    }),
    [overallStatus, chains, mantleHealth, ethereumHealth]
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

/**
 * Hook to access global connection state.
 * Must be used within ConnectionProvider.
 */
export function useConnectionState(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnectionState must be used within ConnectionProvider');
  }
  return context;
}
