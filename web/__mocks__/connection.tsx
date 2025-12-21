/**
 * Mock for lib/connection module in tests.
 * Provides a stable connected state for component testing.
 */

import * as React from 'react';

export const mockConnectionState = {
  overallStatus: 'connected' as const,
  chains: {
    15000: {
      chainId: 15000,
      chainName: 'Mantle',
      status: 'connected' as const,
      blockNumber: 12345n,
      lastSeen: Date.now(),
      consecutiveFailures: 0,
      error: null,
    },
    10001: {
      chainId: 10001,
      chainName: 'Ethereum',
      status: 'connected' as const,
      blockNumber: 67890n,
      lastSeen: Date.now(),
      consecutiveFailures: 0,
      error: null,
    },
  },
  isDegraded: false,
  refresh: jest.fn(),
};

export const ConnectionProvider = ({ children }: { children: React.ReactNode }) => children;
export const useConnectionState = jest.fn(() => mockConnectionState);

export type { ConnectionStatus, ChainHealth, ConnectionState } from '../lib/connection/types';
export { CONNECTION_THRESHOLDS } from '../lib/connection/types';
