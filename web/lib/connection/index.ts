/**
 * Connection state module for RPC health monitoring.
 *
 * Provides real-time visibility into RPC connection status for each chain.
 * Uses eth_blockNumber polling (5s interval) to detect connectivity issues.
 *
 * Status states:
 * - connected (green): RPC responding normally
 * - reconnecting (yellow): 1-2 consecutive failures
 * - disconnected (red): 3+ consecutive failures
 *
 * Usage:
 * 1. Wrap app with ConnectionProvider
 * 2. Use useConnectionState() hook to access status
 * 3. Display with ConnectionIndicator component
 */

export { ConnectionProvider, useConnectionState } from './ConnectionContext';
export type {
  ConnectionStatus,
  ChainHealth,
  ConnectionState,
} from './types';
export { CONNECTION_THRESHOLDS } from './types';
