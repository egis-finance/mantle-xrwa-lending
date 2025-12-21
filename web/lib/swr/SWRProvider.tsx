'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { categorizeError, isRetriableError, getRetryDelay, RETRY_CONFIGS } from '../errors';

interface SWRProviderProps {
  children: ReactNode;
}

/**
 * Centralized SWR configuration with intelligent error handling.
 * Uses error categorization to determine retry behavior:
 * - Network errors: Retry with exponential backoff
 * - Contract reverts: Never retry (deterministic failure)
 * - Wallet errors: Never retry (requires user action)
 * - Config errors: Never retry (developer issue)
 * - Unknown errors: Retry with conservative backoff
 */
export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        // Use category-specific max retries (network: 3, unknown: 2, others: 0)
        errorRetryCount: RETRY_CONFIGS.network.maxRetries,
        shouldRetryOnError: (error) => {
          // Categorize error and check if retriable
          const categorized = categorizeError(error instanceof Error ? error : new Error(String(error)));
          return isRetriableError(categorized);
        },
        onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
          // Categorize the error for intelligent retry handling
          const wrapped = error instanceof Error ? error : new Error(String(error));
          const categorized = categorizeError(wrapped);
          const config = RETRY_CONFIGS[categorized.category];

          // Bail if category shouldn't retry or max retries exceeded
          if (!config.shouldRetry || retryCount >= config.maxRetries) {
            return;
          }

          // Calculate delay with exponential backoff and jitter
          const delay = getRetryDelay(
            categorized,
            retryCount,
            config.baseDelay,
            config.maxDelay,
            config.backoffMultiplier
          );

          setTimeout(() => revalidate({ retryCount }), delay);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
