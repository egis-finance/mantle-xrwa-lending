import type { CategorizedError, WalletAction, WalletSubcategory } from './types';
import {
  detectNetworkError,
  detectContractError,
  detectWalletError,
  detectConfigError,
} from './viem-mapper';
import { getErrorMessage, getContractErrorMessage } from './messages';

/**
 * Map wallet subcategories to suggested user actions.
 */
function getWalletAction(subcategory: WalletSubcategory): WalletAction {
  const actionMap: Record<WalletSubcategory, WalletAction> = {
    user_rejected: 'retry_transaction',
    insufficient_funds: 'add_funds',
    wrong_network: 'switch_network',
    not_connected: 'connect_wallet',
    unauthorized: 'unlock_wallet',
  };
  return actionMap[subcategory];
}

/**
 * Categorize any Error into a structured CategorizedError.
 * Uses viem error detection first, then falls back to pattern matching.
 *
 * Priority order:
 * 1. Wallet errors (most specific user action needed)
 * 2. Contract errors (don't retry reverts)
 * 3. Network errors (retriable)
 * 4. Config errors (developer issue)
 * 5. Unknown (safe fallback)
 */
export function categorizeError(error: Error): CategorizedError {
  // 1. Check for wallet errors first (most specific user action needed)
  const walletResult = detectWalletError(error);
  if (walletResult) {
    const messageKey = `error.wallet.${walletResult.subcategory}`;
    return {
      category: 'wallet',
      subcategory: walletResult.subcategory,
      messageKey,
      userMessage: getErrorMessage(messageKey),
      original: error,
      retriable: false,
      action: getWalletAction(walletResult.subcategory),
    };
  }

  // 2. Check for contract errors (don't retry reverts)
  const contractResult = detectContractError(error);
  if (contractResult) {
    const messageKey = `error.contract.${contractResult.subcategory}`;
    return {
      category: 'contract',
      subcategory: contractResult.subcategory,
      messageKey,
      userMessage: getContractErrorMessage(contractResult.subcategory, contractResult.revertReason),
      original: error,
      retriable: false,
      revertReason: contractResult.revertReason,
    };
  }

  // 3. Check for network errors (retriable)
  const networkResult = detectNetworkError(error);
  if (networkResult) {
    const messageKey = `error.network.${networkResult.subcategory}`;
    return {
      category: 'network',
      subcategory: networkResult.subcategory,
      messageKey,
      userMessage: getErrorMessage(messageKey),
      original: error,
      retriable: true,
      retryAfter: networkResult.retryAfter,
    };
  }

  // 4. Check for configuration errors
  const configResult = detectConfigError(error);
  if (configResult) {
    const messageKey = `error.config.${configResult.subcategory}`;
    return {
      category: 'config',
      subcategory: configResult.subcategory,
      messageKey,
      userMessage: getErrorMessage(messageKey),
      original: error,
      retriable: false,
      missingVar: configResult.missingVar,
    };
  }

  // 5. Unknown error - treat as retriable with backoff
  return {
    category: 'unknown',
    subcategory: undefined,
    messageKey: 'error.unknown',
    userMessage: 'Something went wrong. Please try again.',
    original: error,
    retriable: true,
  };
}

/**
 * Type guard for checking if error is retriable.
 */
export function isRetriableError(categorized: CategorizedError): boolean {
  return categorized.retriable;
}

/**
 * Get retry delay for categorized error with exponential backoff.
 */
export function getRetryDelay(
  categorized: CategorizedError,
  retryCount: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000,
  multiplier: number = 2
): number {
  // Respect rate-limit retry-after header for network errors
  if (categorized.category === 'network' && categorized.retryAfter) {
    return Math.max(categorized.retryAfter, baseDelay);
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(multiplier, retryCount);
  const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15 multiplier
  return Math.min(exponentialDelay * jitter, maxDelay);
}
