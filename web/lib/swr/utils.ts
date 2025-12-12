import type { Address } from 'viem';
import type { SWRResponse } from 'swr';

/**
 * Normalize address for cache key consistency (lowercase).
 */
export const normalizeAddress = (addr: Address): string => addr.toLowerCase();

/**
 * BigInt-safe serialization for cache keys.
 * Lowercases ALL 0x strings (addresses, bytes32 marketId, etc.) to avoid duplicate keys.
 */
export const serializeArgs = (args: readonly unknown[]): string =>
  JSON.stringify(args, (_, v) => {
    if (typeof v === 'bigint') return `bigint:${v.toString()}`;
    // Lowercase any hex string (addresses, bytes32, etc.)
    if (typeof v === 'string' && v.startsWith('0x')) return v.toLowerCase();
    return v;
  });

/**
 * Standardized return shape for all SWR-based contract read hooks.
 */
export interface ReadResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching: boolean;
}

/**
 * Adapter to normalize raw SWR response into consistent ReadResult shape.
 * Handles the disabled-hook case where cacheKey=null returns undefined for both data and error.
 *
 * @param swrResult - Raw SWR hook response
 * @param enabled - Whether the hook is enabled (cacheKey !== null)
 */
export function toReadResult<T>(
  swrResult: SWRResponse<T, Error>,
  enabled: boolean
): ReadResult<T> {
  const { data, error, isValidating, mutate } = swrResult;

  // isLoading: only true when enabled AND waiting for initial data
  const isLoading = enabled && data === undefined && error === undefined;

  // isRefetching: only true when enabled AND validating but not initial load
  const isRefetching = enabled && isValidating && !isLoading;

  return {
    data,
    isLoading,
    isError: !!error,
    error: error ?? null,
    refetch: () => mutate(),
    isRefetching,
  };
}
