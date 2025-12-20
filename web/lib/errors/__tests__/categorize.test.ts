import {
  BaseError,
  ContractFunctionRevertedError,
  TimeoutError as ViemTimeoutError,
  UserRejectedRequestError,
  InsufficientFundsError,
} from 'viem';
import { categorizeError, isRetriableError, getRetryDelay } from '../categorize';
import type { CategorizedError } from '../types';

/**
 * Helper to create viem-style errors that pass instanceof checks.
 * Viem errors extend BaseError and have a walk() method for traversing error chains.
 */
function createMockViemError<T extends BaseError>(
  ErrorClass: new (...args: never[]) => T,
  message: string,
  extras?: Record<string, unknown>
): T {
  const instance = Object.create(ErrorClass.prototype) as T;
  Object.defineProperty(instance, 'message', { value: message, writable: true });
  Object.defineProperty(instance, 'name', { value: ErrorClass.name, writable: true });

  // Assign any extras like 'reason', 'data', 'shortMessage'
  if (extras) {
    Object.entries(extras).forEach(([key, value]) => {
      Object.defineProperty(instance, key, { value, writable: true });
    });
  }

  // BaseError.walk() traverses error chain - mock it to return self
  instance.walk = (fn: (err: Error) => boolean) => {
    if (fn(instance)) return instance;
    return null;
  };

  return instance;
}

describe('categorizeError', () => {
  describe('wallet errors', () => {
    it('categorizes user rejection via viem error', () => {
      const error = createMockViemError(UserRejectedRequestError, 'User rejected');
      const result = categorizeError(error);

      expect(result.category).toBe('wallet');
      expect(result.subcategory).toBe('user_rejected');
      expect(result.retriable).toBe(false);
      expect(result.action).toBe('retry_transaction');
      expect(result.userMessage).toBe('Transaction was cancelled.');
    });

    it('categorizes insufficient funds via viem error', () => {
      const error = createMockViemError(InsufficientFundsError, 'Not enough ETH');
      const result = categorizeError(error);

      expect(result.category).toBe('wallet');
      expect(result.subcategory).toBe('insufficient_funds');
      expect(result.retriable).toBe(false);
      expect(result.action).toBe('add_funds');
    });

    it('categorizes user rejection via message pattern', () => {
      const error = new Error('Request rejected by user');
      const result = categorizeError(error);

      expect(result.category).toBe('wallet');
      expect(result.subcategory).toBe('user_rejected');
    });

    it('categorizes insufficient balance via message pattern', () => {
      const error = new Error('insufficient balance for transfer');
      const result = categorizeError(error);

      expect(result.category).toBe('wallet');
      expect(result.subcategory).toBe('insufficient_funds');
    });

    it('categorizes wrong network via message pattern', () => {
      const error = new Error('wrong network detected');
      const result = categorizeError(error);

      expect(result.category).toBe('wallet');
      expect(result.subcategory).toBe('wrong_network');
      expect(result.action).toBe('switch_network');
    });

    it('categorizes wallet not connected via message pattern', () => {
      const error = new Error('wallet not connected');
      const result = categorizeError(error);

      expect(result.category).toBe('wallet');
      expect(result.subcategory).toBe('not_connected');
      expect(result.action).toBe('connect_wallet');
    });
  });

  describe('contract errors', () => {
    it('categorizes contract revert via viem error', () => {
      const error = createMockViemError(
        ContractFunctionRevertedError,
        'Execution reverted',
        { reason: 'InsufficientBalance', data: { errorName: 'InsufficientBalance' } }
      );
      const result = categorizeError(error);

      expect(result.category).toBe('contract');
      expect(result.subcategory).toBe('revert_with_reason');
      expect(result.retriable).toBe(false);
      expect(result.revertReason).toBe('InsufficientBalance');
    });

    it('categorizes execution reverted via message pattern', () => {
      const error = new Error('execution reverted');
      const result = categorizeError(error);

      expect(result.category).toBe('contract');
      expect(result.subcategory).toBe('execution_reverted');
      expect(result.retriable).toBe(false);
    });

    it('categorizes out of gas via message pattern', () => {
      const error = new Error('transaction ran out of gas');
      const result = categorizeError(error);

      expect(result.category).toBe('contract');
      expect(result.subcategory).toBe('out_of_gas');
    });

    it('extracts revert reason from message', () => {
      // Must include "revert" keyword to trigger contract error detection
      const error = new Error('execution reverted with reason: InsufficientBalance');
      const result = categorizeError(error);

      expect(result.category).toBe('contract');
      expect(result.subcategory).toBe('revert_with_reason');
      expect(result.revertReason).toBe('InsufficientBalance');
    });
  });

  describe('network errors', () => {
    it('categorizes timeout via viem error', () => {
      const error = createMockViemError(ViemTimeoutError, 'Request timed out');
      const result = categorizeError(error);

      expect(result.category).toBe('network');
      expect(result.subcategory).toBe('timeout');
      expect(result.retriable).toBe(true);
    });

    it('categorizes timeout via message pattern', () => {
      const error = new Error('request timed out after 30s');
      const result = categorizeError(error);

      expect(result.category).toBe('network');
      expect(result.subcategory).toBe('timeout');
      expect(result.retriable).toBe(true);
    });

    it('categorizes connection refused via message pattern', () => {
      const error = new Error('ECONNREFUSED');
      const result = categorizeError(error);

      expect(result.category).toBe('network');
      expect(result.subcategory).toBe('connection_refused');
    });

    it('categorizes fetch failed as connection refused', () => {
      const error = new Error('fetch failed');
      const result = categorizeError(error);

      expect(result.category).toBe('network');
      expect(result.subcategory).toBe('connection_refused');
    });

    it('categorizes offline via message pattern', () => {
      const error = new Error('network offline detected');
      const result = categorizeError(error);

      expect(result.category).toBe('network');
      expect(result.subcategory).toBe('offline');
    });
  });

  describe('config errors', () => {
    it('categorizes missing env var', () => {
      const error = new Error('Missing env var: NEXT_PUBLIC_RPC_URL');
      const result = categorizeError(error);

      expect(result.category).toBe('config');
      expect(result.subcategory).toBe('missing_env');
      expect(result.retriable).toBe(false);
      expect(result.missingVar).toBe('NEXT_PUBLIC_RPC_URL');
    });

    it('categorizes invalid address (0x0)', () => {
      const error = new Error('Invalid address 0x0 for contract');
      const result = categorizeError(error);

      expect(result.category).toBe('config');
      expect(result.subcategory).toBe('invalid_address');
    });

    it('categorizes invalid chain id', () => {
      const error = new Error('chain is invalid');
      const result = categorizeError(error);

      expect(result.category).toBe('config');
      expect(result.subcategory).toBe('invalid_chain_id');
    });
  });

  describe('unknown errors', () => {
    it('categorizes unrecognized errors as unknown', () => {
      const error = new Error('Something completely unexpected happened');
      const result = categorizeError(error);

      expect(result.category).toBe('unknown');
      expect(result.subcategory).toBeUndefined();
      expect(result.retriable).toBe(true);
      expect(result.userMessage).toBe('Something went wrong. Please try again.');
    });
  });

  describe('priority ordering', () => {
    it('wallet errors take priority over network errors', () => {
      // Error that could match both wallet and network patterns
      const error = new Error('user rejected - timeout waiting for confirmation');
      const result = categorizeError(error);

      expect(result.category).toBe('wallet');
      expect(result.subcategory).toBe('user_rejected');
    });

    it('contract errors take priority over network errors', () => {
      const error = new Error('execution reverted - timeout');
      const result = categorizeError(error);

      expect(result.category).toBe('contract');
    });
  });
});

describe('isRetriableError', () => {
  it('returns true for network errors', () => {
    const categorized: CategorizedError = {
      category: 'network',
      subcategory: 'timeout',
      messageKey: 'error.network.timeout',
      userMessage: 'Request timed out',
      original: new Error('timeout'),
      retriable: true,
    };
    expect(isRetriableError(categorized)).toBe(true);
  });

  it('returns true for unknown errors', () => {
    const categorized: CategorizedError = {
      category: 'unknown',
      subcategory: undefined,
      messageKey: 'error.unknown',
      userMessage: 'Something went wrong',
      original: new Error('unknown'),
      retriable: true,
    };
    expect(isRetriableError(categorized)).toBe(true);
  });

  it('returns false for contract errors', () => {
    const categorized: CategorizedError = {
      category: 'contract',
      subcategory: 'execution_reverted',
      messageKey: 'error.contract.execution_reverted',
      userMessage: 'Transaction would fail',
      original: new Error('revert'),
      retriable: false,
    };
    expect(isRetriableError(categorized)).toBe(false);
  });

  it('returns false for wallet errors', () => {
    const categorized: CategorizedError = {
      category: 'wallet',
      subcategory: 'user_rejected',
      messageKey: 'error.wallet.user_rejected',
      userMessage: 'Transaction cancelled',
      original: new Error('rejected'),
      retriable: false,
    };
    expect(isRetriableError(categorized)).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('returns base delay for first retry', () => {
    const categorized: CategorizedError = {
      category: 'network',
      subcategory: 'timeout',
      messageKey: 'error.network.timeout',
      userMessage: 'Timeout',
      original: new Error('timeout'),
      retriable: true,
    };

    const delay = getRetryDelay(categorized, 0, 1000, 30000, 2);

    // First retry: ~1000ms (with jitter 0.85-1.15)
    expect(delay).toBeGreaterThanOrEqual(850);
    expect(delay).toBeLessThanOrEqual(1150);
  });

  it('applies exponential backoff', () => {
    const categorized: CategorizedError = {
      category: 'network',
      subcategory: 'server_error',
      messageKey: 'error.network.server_error',
      userMessage: 'Server error',
      original: new Error('500'),
      retriable: true,
    };

    const delay0 = getRetryDelay(categorized, 0, 1000, 30000, 2);
    const delay1 = getRetryDelay(categorized, 1, 1000, 30000, 2);
    const delay2 = getRetryDelay(categorized, 2, 1000, 30000, 2);

    // Each subsequent retry should approximately double (with jitter)
    expect(delay1).toBeGreaterThan(delay0);
    expect(delay2).toBeGreaterThan(delay1);
  });

  it('respects max delay', () => {
    const categorized: CategorizedError = {
      category: 'network',
      subcategory: 'rate_limited',
      messageKey: 'error.network.rate_limited',
      userMessage: 'Rate limited',
      original: new Error('429'),
      retriable: true,
    };

    const delay = getRetryDelay(categorized, 10, 1000, 5000, 2);

    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('respects retryAfter for rate-limited errors', () => {
    const categorized: CategorizedError = {
      category: 'network',
      subcategory: 'rate_limited',
      messageKey: 'error.network.rate_limited',
      userMessage: 'Rate limited',
      original: new Error('429'),
      retriable: true,
      retryAfter: 10000, // Server says wait 10s
    };

    const delay = getRetryDelay(categorized, 0, 1000, 30000, 2);

    // Should use retryAfter value, not base delay
    expect(delay).toBe(10000);
  });

  it('uses baseDelay when retryAfter is lower', () => {
    const categorized: CategorizedError = {
      category: 'network',
      subcategory: 'rate_limited',
      messageKey: 'error.network.rate_limited',
      userMessage: 'Rate limited',
      original: new Error('429'),
      retriable: true,
      retryAfter: 500, // Server says 500ms, but base is 1000
    };

    const delay = getRetryDelay(categorized, 0, 1000, 30000, 2);

    expect(delay).toBe(1000);
  });
});
