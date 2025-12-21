/**
 * Toast notification module using Sonner.
 *
 * Provides transaction-focused toast utilities for DeFi operations:
 * - withTransactionToast: Wrap any promise with loading/success/error toasts
 * - showCrossChainToast: Multi-step progress for cross-chain flows
 * - showSuccess/Error/Warning/Info: Simple one-off notifications
 *
 * Usage:
 * 1. Add <Toaster /> from sonner to providers.tsx
 * 2. Import helpers from this module
 * 3. Wrap transaction promises with withTransactionToast()
 *
 * @example
 * import { withTransactionToast } from '@/lib/toast';
 *
 * await withTransactionToast(
 *   lockUSDY(amount),
 *   { chainId: MANTLE_CHAIN_ID, action: 'Lock USDY' }
 * );
 */

export { Toaster } from 'sonner';
export { TOAST_CONFIG, TOAST_DURATIONS, CHAIN_NAMES } from './config';
export {
  withTransactionToast,
  showSuccess,
  showError,
  showCategorizedError,
  showWarning,
  showInfo,
  showCrossChainToast,
  type CrossChainStep,
  type CrossChainStepStatus,
} from './transaction';
