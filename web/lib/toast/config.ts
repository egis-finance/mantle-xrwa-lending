/**
 * Toast configuration for Sonner.
 * Centralized settings for position, duration, and theming.
 */

import type { ToasterProps } from 'sonner';

export const TOAST_CONFIG: ToasterProps = {
  position: 'bottom-right',
  duration: 5000,
  closeButton: true,
  richColors: true,
  expand: false,
  // Theme matches app styling
  toastOptions: {
    style: {
      fontFamily: 'inherit',
    },
  },
};

/**
 * Duration presets for different toast types.
 */
export const TOAST_DURATIONS = {
  /** Quick confirmation (success, info) */
  SHORT: 3000,
  /** Standard duration */
  MEDIUM: 5000,
  /** Longer messages (warnings) */
  LONG: 8000,
  /** Persistent until dismissed (errors) */
  PERSISTENT: Infinity,
} as const;

/**
 * Chain display names for transaction toasts.
 */
export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  5000: 'Mantle',
  15000: 'Mantle VTE',
  10001: 'Ethereum VTE',
} as const;
