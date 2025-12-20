/**
 * Connection state types for RPC health monitoring.
 *
 * Visual states:
 * - connected: Green dot - both chains responding
 * - reconnecting: Pulsing yellow - 1-2 consecutive failures
 * - disconnected: Red dot - 3+ consecutive failures
 */

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

/**
 * Health state for a single chain's RPC connection.
 */
export interface ChainHealth {
  chainId: number;
  chainName: string;
  status: ConnectionStatus;
  /** Latest block number when connected */
  blockNumber: bigint | null;
  /** Timestamp of last successful response */
  lastSeen: number | null;
  /** Count of consecutive failed requests */
  consecutiveFailures: number;
  /** Current error if any */
  error: Error | null;
}

/**
 * Aggregate connection state across all monitored chains.
 */
export interface ConnectionState {
  /** Overall status - worst of all chains */
  overallStatus: ConnectionStatus;
  /** Individual chain health states */
  chains: Record<number, ChainHealth>;
  /** Whether any chain is degraded (reconnecting or disconnected) */
  isDegraded: boolean;
}

/**
 * Thresholds for connection status transitions.
 */
export const CONNECTION_THRESHOLDS = {
  /** Failures before showing "reconnecting" (yellow) */
  RECONNECTING_THRESHOLD: 1,
  /** Failures before showing "disconnected" (red) */
  DISCONNECTED_THRESHOLD: 3,
  /** Polling interval in milliseconds */
  POLL_INTERVAL: 5000,
  /** Request timeout in milliseconds */
  TIMEOUT: 10000,
} as const;
