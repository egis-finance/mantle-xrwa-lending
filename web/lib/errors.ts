/**
 * Formats blockchain and wallet errors into user-friendly messages.
 * Handles common cases like user rejection, insufficient funds, and network issues.
 * In development mode, logs full error details to console with 5s deduplication.
 */

// Module-level deduplication cache for dev logging
const recentErrors = new Map<string, number>();
const ERROR_DEDUPE_TTL_MS = 5000;

function getErrorKey(error: unknown, message: string): string {
  if (error instanceof Error) {
    const stack = error.stack?.slice(0, 300) ?? '';
    return `${error.constructor.name}|${message.slice(0, 200)}|${stack}`;
  }
  try {
    return `obj|${JSON.stringify(error)?.slice(0, 300) ?? ''}`;
  } catch {
    return `unknown|${message.slice(0, 200)}`;
  }
}

export function formatError(error: unknown): string {
  if (!error) return 'Transaction failed';

  const message = error instanceof Error ? error.message : String(error);

  // Dev-mode logging with deduplication (5s TTL)
  if (process.env.NODE_ENV === 'development') {
    const errorKey = getErrorKey(error, message);
    const now = Date.now();
    const lastLogged = recentErrors.get(errorKey);

    if (!lastLogged || now - lastLogged > ERROR_DEDUPE_TTL_MS) {
      console.error('[formatError] Raw error:', error);
      recentErrors.set(errorKey, now);

      // Cleanup old entries
      if (recentErrors.size > 50) {
        for (const [key, time] of recentErrors) {
          if (now - time > ERROR_DEDUPE_TTL_MS) recentErrors.delete(key);
        }
      }
    }
  }

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

