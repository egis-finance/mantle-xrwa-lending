/**
 * Unit tests for error handling utilities
 */

import { withTimeout, writeContractWithTimeout, formatError, SIGNING_TIMEOUT_MS } from '@/lib/errors';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves when promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 1000, 'Test operation');
    expect(result).toBe('success');
  });

  it('rejects when promise takes longer than timeout', async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const timeoutPromise = withTimeout(slowPromise, 1000, 'Test operation');

    // Advance past the timeout
    jest.advanceTimersByTime(1001);

    await expect(timeoutPromise).rejects.toThrow('Test operation timed out after 1s');
  });

  it('includes operation name in error message', async () => {
    const slowPromise = new Promise<string>(() => {
      // Never resolves
    });

    const timeoutPromise = withTimeout(slowPromise, 500, 'Custom signing');

    jest.advanceTimersByTime(501);

    await expect(timeoutPromise).rejects.toThrow('Custom signing timed out');
  });

  it('uses default timeout when not specified', async () => {
    const slowPromise = new Promise<string>(() => {
      // Never resolves
    });

    const timeoutPromise = withTimeout(slowPromise);

    // Default is SIGNING_TIMEOUT_MS (60000)
    jest.advanceTimersByTime(SIGNING_TIMEOUT_MS + 1);

    await expect(timeoutPromise).rejects.toThrow('timed out after 60s');
  });

  it('clears timeout when promise resolves', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    const promise = Promise.resolve('success');
    await withTimeout(promise, 1000, 'Test');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('clears timeout when promise rejects', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    const promise = Promise.reject(new Error('Original error'));

    await expect(withTimeout(promise, 1000, 'Test')).rejects.toThrow('Original error');
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it('propagates original error when promise rejects before timeout', async () => {
    const originalError = new Error('Contract reverted');
    const promise = Promise.reject(originalError);

    await expect(withTimeout(promise, 1000, 'Test')).rejects.toThrow('Contract reverted');
  });
});

describe('writeContractWithTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves when writeContract completes before timeout', async () => {
    const mockHash = '0x1234567890abcdef' as const;
    const writeContractFn = jest.fn().mockResolvedValue(mockHash);

    const result = await writeContractWithTimeout(writeContractFn, 'Test signing');

    expect(result).toBe(mockHash);
    expect(writeContractFn).toHaveBeenCalledTimes(1);
  });

  it('times out when writeContract hangs', async () => {
    const writeContractFn = jest.fn().mockImplementation(
      () =>
        new Promise(() => {
          // Never resolves - simulates WAAS hang
        })
    );

    const promise = writeContractWithTimeout(writeContractFn, 'Approval signing');

    // Advance past the default timeout (60s)
    jest.advanceTimersByTime(SIGNING_TIMEOUT_MS + 1);

    await expect(promise).rejects.toThrow('Approval signing timed out');
  });

  it('uses SIGNING_TIMEOUT_MS as default timeout', async () => {
    const writeContractFn = jest.fn().mockImplementation(
      () => new Promise(() => {})
    );

    const promise = writeContractWithTimeout(writeContractFn, 'Test');

    // Should not timeout before SIGNING_TIMEOUT_MS
    jest.advanceTimersByTime(SIGNING_TIMEOUT_MS - 1);
    expect(writeContractFn).toHaveBeenCalled();

    // Should timeout after SIGNING_TIMEOUT_MS
    jest.advanceTimersByTime(2);
    await expect(promise).rejects.toThrow('timed out');
  });

  it('propagates contract revert errors', async () => {
    const revertError = new Error('execution reverted: insufficient balance');
    const writeContractFn = jest.fn().mockRejectedValue(revertError);

    await expect(writeContractWithTimeout(writeContractFn, 'Test')).rejects.toThrow(
      'execution reverted: insufficient balance'
    );
  });

  it('propagates user rejection errors', async () => {
    const userRejectedError = new Error('User rejected the request');
    const writeContractFn = jest.fn().mockRejectedValue(userRejectedError);

    await expect(writeContractWithTimeout(writeContractFn, 'Test')).rejects.toThrow(
      'User rejected the request'
    );
  });
});

describe('formatError', () => {
  it('returns default message for null/undefined', () => {
    expect(formatError(null)).toBe('Transaction failed');
    expect(formatError(undefined)).toBe('Transaction failed');
  });

  it('detects user rejection', () => {
    expect(formatError(new Error('user rejected'))).toBe('Transaction cancelled by user');
    expect(formatError(new Error('User rejected'))).toBe('Transaction cancelled by user');
    expect(formatError(new Error('User denied transaction'))).toBe('Transaction cancelled by user');
    expect(formatError(new Error('ACTION_REJECTED'))).toBe('Transaction cancelled by user');
  });

  it('detects insufficient funds', () => {
    expect(formatError(new Error('insufficient funds for gas'))).toBe(
      'Insufficient funds for this transaction'
    );
  });

  it('detects network errors', () => {
    expect(formatError(new Error('network error occurred'))).toBe(
      'Network error. Please check your connection and try again.'
    );
    expect(formatError(new Error('failed to fetch'))).toBe(
      'Network error. Please check your connection and try again.'
    );
  });

  it('detects timeout errors (various phrasings)', () => {
    expect(formatError(new Error('request timeout'))).toBe('Transaction timed out. Please try again.');
    expect(formatError(new Error('Operation timed out'))).toBe('Transaction timed out. Please try again.');
    expect(formatError(new Error('Time limit exceeded'))).toBe('Transaction timed out. Please try again.');
  });

  it('handles string errors', () => {
    expect(formatError('user rejected')).toBe('Transaction cancelled by user');
    expect(formatError('some random error')).toBe('Transaction failed. Please try again.');
  });

  it('truncates long error messages in production', () => {
    const originalEnv = process.env.NODE_ENV;

    // In production, generic message is shown
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    const longError = new Error('a'.repeat(200));
    expect(formatError(longError)).toBe('Transaction failed. Please try again.');

    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
  });
});

describe('SIGNING_TIMEOUT_MS', () => {
  it('is 60 seconds', () => {
    expect(SIGNING_TIMEOUT_MS).toBe(60_000);
  });
});
