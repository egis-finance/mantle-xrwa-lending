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
  refetch: () => Promise<void>;
  /** Background revalidation in progress (has data, fetching fresh). */
  isRefetching: boolean;
}

/**
 * Adapter to normalize raw SWR response into consistent ReadResult shape.
 * Uses SWR 2.x native isLoading (isValidating && !data && !error) for accurate
 * loading state detection, gated by enabled flag for disabled-hook handling.
 *
 * @param swrResult - Raw SWR hook response
 * @param enabled - Whether the hook is enabled (cacheKey !== null)
 */
export function toReadResult<T>(
  swrResult: SWRResponse<T, Error>,
  enabled: boolean
): ReadResult<T> {
  const { data, error, isLoading: swrIsLoading, isValidating, mutate } = swrResult;

  // Use SWR's native isLoading (isValidating && !data && !error), gated by enabled
  const isLoading = enabled && swrIsLoading;

  // isRefetching: validating with existing data (background revalidation)
  const isRefetching = enabled && isValidating && !swrIsLoading;

  return {
    data,
    isLoading,
    isError: !!error,
    error: error ?? null,
    refetch: async () => { await mutate(); },
    isRefetching,
  };
}
