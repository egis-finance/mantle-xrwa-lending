import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError,
  UserRejectedRequestError,
  InsufficientFundsError,
  ChainMismatchError,
} from 'viem';
import type { NetworkSubcategory, ContractSubcategory, WalletSubcategory } from './types';

/**
 * Extract the deepest viem error of a specific type from an error chain.
 * Viem wraps errors, so we traverse the chain to find root cause.
 */
export function findViemError<T extends BaseError>(
  error: Error,
  ErrorClass: new (...args: never[]) => T
): T | null {
  if (!(error instanceof BaseError)) return null;
  return error.walk((e) => e instanceof ErrorClass) as T | null;
}

/**
 * Detect network-related viem errors.
 */
export function detectNetworkError(
  error: Error
): { subcategory: NetworkSubcategory; retryAfter?: number } | null {
  // Timeout errors
  if (error instanceof TimeoutError || findViemError(error, TimeoutError)) {
    return { subcategory: 'timeout' };
  }

  // HTTP errors with status codes
  const httpError = findViemError(error, HttpRequestError);
  if (httpError) {
    const status = httpError.status;
    if (status === 429) {
      return { subcategory: 'rate_limited', retryAfter: 5000 };
    }
    if (status && status >= 500) {
      return { subcategory: 'server_error' };
    }
    if (status === 0 || !status) {
      const message = error.message.toLowerCase();
      if (message.includes('cors')) {
        return { subcategory: 'cors' };
      }
      return { subcategory: 'connection_refused' };
    }
  }

  // String pattern fallbacks for non-viem errors
  const message = error.message.toLowerCase();
  if (message.includes('network') && message.includes('offline')) {
    return { subcategory: 'offline' };
  }
  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return { subcategory: 'connection_refused' };
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return { subcategory: 'timeout' };
  }
  if (message.includes('fetch failed') || message.includes('failed to fetch')) {
    return { subcategory: 'connection_refused' };
  }

  return null;
}

/**
 * Detect contract-related viem errors.
 */
export function detectContractError(
  error: Error
): { subcategory: ContractSubcategory; revertReason?: string } | null {
  // Contract function reverted with decoded reason
  const revertError = findViemError(error, ContractFunctionRevertedError);
  if (revertError) {
    return {
      subcategory: 'revert_with_reason',
      revertReason: revertError.reason ?? revertError.data?.errorName ?? 'Unknown reason',
    };
  }

  // Contract execution error (wrapper for reverts)
  const execError = findViemError(error, ContractFunctionExecutionError);
  if (execError) {
    const message = execError.shortMessage.toLowerCase();
    if (message.includes('out of gas')) {
      return { subcategory: 'out_of_gas' };
    }
    if (message.includes('execution reverted')) {
      return { subcategory: 'execution_reverted' };
    }
    return { subcategory: 'revert_unknown' };
  }

  // String pattern fallbacks
  const message = error.message.toLowerCase();
  if (message.includes('execution reverted') || message.includes('revert')) {
    // Try to extract reason from message
    const reasonMatch = error.message.match(/reason[=:]?\s*["']?([^"'\n]+)["']?/i);
    if (reasonMatch) {
      return { subcategory: 'revert_with_reason', revertReason: reasonMatch[1].trim() };
    }
    return { subcategory: 'execution_reverted' };
  }
  if (message.includes('out of gas')) {
    return { subcategory: 'out_of_gas' };
  }

  return null;
}

/**
 * Detect wallet-related viem errors.
 */
export function detectWalletError(
  error: Error
): { subcategory: WalletSubcategory } | null {
  // User rejected (EIP-1193 code 4001)
  if (error instanceof UserRejectedRequestError || findViemError(error, UserRejectedRequestError)) {
    return { subcategory: 'user_rejected' };
  }

  // Insufficient funds
  if (error instanceof InsufficientFundsError || findViemError(error, InsufficientFundsError)) {
    return { subcategory: 'insufficient_funds' };
  }

  // Chain mismatch
  if (error instanceof ChainMismatchError || findViemError(error, ChainMismatchError)) {
    return { subcategory: 'wrong_network' };
  }

  // String pattern fallbacks
  const message = error.message.toLowerCase();
  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected by user')
  ) {
    return { subcategory: 'user_rejected' };
  }
  if (message.includes('insufficient funds') || message.includes('insufficient balance')) {
    return { subcategory: 'insufficient_funds' };
  }
  if (message.includes('wrong network') || message.includes('chain mismatch')) {
    return { subcategory: 'wrong_network' };
  }
  if (message.includes('no wallet') || message.includes('wallet not connected')) {
    return { subcategory: 'not_connected' };
  }

  return null;
}

/**
 * Detect configuration errors.
 */
export function detectConfigError(
  error: Error
): { subcategory: 'missing_env' | 'invalid_address' | 'invalid_chain_id'; missingVar?: string } | null {
  const message = error.message.toLowerCase();

  // Missing env var patterns
  const envMatch = error.message.match(/missing.*env.*:\s*(\w+)/i);
  if (envMatch) {
    return { subcategory: 'missing_env', missingVar: envMatch[1] };
  }

  if (message.includes('0x0') && (message.includes('address') || message.includes('contract'))) {
    return { subcategory: 'invalid_address' };
  }

  if (message.includes('chain') && message.includes('invalid')) {
    return { subcategory: 'invalid_chain_id' };
  }

  return null;
}
