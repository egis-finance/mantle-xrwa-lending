/**
 * Formats blockchain and wallet errors into user-friendly messages.
 * Handles common cases like user rejection, insufficient funds, and network issues.
 * In development mode, logs full error details to console for debugging.
 */
export function formatError(error: unknown): string {
  if (!error) return 'Transaction failed';

  // Dev-mode logging for debugging - full error context
  if (process.env.NODE_ENV === 'development') {
    console.error('[formatError] Raw error:', error);
  }

  const message = error instanceof Error ? error.message : String(error);

  // User rejected the transaction in their wallet
  if (
    message.includes('user rejected') ||
    message.includes('User rejected') ||
    message.includes('User denied') ||
    message.includes('ACTION_REJECTED')
  ) {
    return 'Transaction cancelled by user';
  }

  // Insufficient funds for gas or transaction
  if (message.includes('insufficient funds')) {
    return 'Insufficient funds for this transaction';
  }

  // Network or RPC issues
  if (message.includes('network error') || message.includes('failed to fetch')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Timeout
  if (message.includes('timeout') || message.includes('exceeded')) {
    return 'Transaction timed out. Please try again.';
  }

  // Fallback with truncated error in dev mode for easier debugging
  if (process.env.NODE_ENV === 'development') {
    const truncated = message.length > 100 ? message.slice(0, 100) + '...' : message;
    return `Transaction failed: ${truncated}`;
  }

  return 'Transaction failed. Please try again.';
}

