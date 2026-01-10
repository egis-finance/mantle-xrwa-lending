/**
 * Formats blockchain and wallet errors into user-friendly messages.
 * Handles common cases like user rejection, insufficient funds, and network issues.
 */
export function formatError(error: unknown): string {
  if (!error) return 'Transaction failed';

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

  // Fallback to a generic message if we don't recognize the specific error
  // but keep it cleaner than the full viem stack trace
  return 'Transaction failed. Please try again.';
}

