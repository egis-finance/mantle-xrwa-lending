'use client';

import { useState } from 'react';
import { useConnectionState } from '@/lib/connection';
import type { ChainHealth, ConnectionStatus } from '@/lib/connection';

/**
 * Status dot colors mapped to connection states.
 * Uses Tailwind's default color palette.
 */
const STATUS_COLORS: Record<ConnectionStatus, { dot: string; pulse?: string }> = {
  connected: { dot: 'bg-green-500' },
  reconnecting: { dot: 'bg-yellow-500', pulse: 'bg-yellow-400' },
  disconnected: { dot: 'bg-red-500' },
};

/**
 * Status labels for accessibility and tooltips.
 */
const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
};

/**
 * Format relative time (e.g., "2s ago", "1m ago").
 */
function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return 'Never';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return 'Over 1h ago';
}

interface ChainStatusRowProps {
  health: ChainHealth;
}

function ChainStatusRow({ health }: ChainStatusRowProps) {
  const colors = STATUS_COLORS[health.status];

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${colors.dot}`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">{health.chainName}</span>
      </div>
      <div className="text-xs text-neutral-400">
        {health.status === 'connected' ? (
          <>Block: {health.blockNumber?.toString() ?? '-'}</>
        ) : (
          <>Last: {formatRelativeTime(health.lastSeen)}</>
        )}
      </div>
    </div>
  );
}

/**
 * Connection status indicator with expandable panel.
 *
 * Shows a colored dot indicating overall RPC health:
 * - Green: All chains connected
 * - Yellow pulsing: Some chains reconnecting
 * - Red: Some chains disconnected
 *
 * Hover/click reveals detailed per-chain status.
 */
export function ConnectionIndicator() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { overallStatus, chains } = useConnectionState();

  const colors = STATUS_COLORS[overallStatus];
  const label = STATUS_LABELS[overallStatus];

  return (
    <div className="relative">
      {/* Status dot button */}
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-neutral-800"
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        aria-label={`Network status: ${label}`}
        aria-expanded={isExpanded}
      >
        <span className="relative flex h-2.5 w-2.5">
          {/* Pulse animation for reconnecting state */}
          {colors.pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${colors.pulse}`}
            />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colors.dot}`}
          />
        </span>
      </button>

      {/* Expandable panel */}
      {isExpanded && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-lg"
          onMouseEnter={() => setIsExpanded(true)}
          onMouseLeave={() => setIsExpanded(false)}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Network Status
          </div>
          <div className="divide-y divide-neutral-800">
            {Object.values(chains).map((health) => (
              <ChainStatusRow key={health.chainId} health={health} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
