/**
 * SWR-based data layer for multi-chain contract reads.
 *
 * Three hook types, all returning a consistent ReadResult shape:
 *
 * 1. useMultiChainRead - Single contract read on one chain
 * 2. useMultiChainBatchRead - Multicall batch on one chain
 * 3. useCrossChainRead - Parallel reads from Mantle + Ethereum
 *
 * Return shape (via toReadResult adapter):
 *   { data, isLoading, isError, error, categorizedError, refetch, isRefetching }
 *
 * Design notes:
 * - SWR chosen over React Query for simpler API and direct cache key control
 * - Cache keys include chainId + normalized address to prevent cross-chain collisions
 * - All hex strings (addresses, bytes32) lowercased in cache keys
 * - RefreshIntervals define polling rates by data sensitivity
 * - Error categorization provides structured handling (network/contract/wallet/config)
 *
 * The toReadResult() adapter normalizes SWR's raw response, handling edge cases:
 * - Disabled hooks (enabled=false) don't show "loading" state
 * - isRefetching distinguishes background revalidation from initial load
 * - categorizedError provides user-friendly messages and retry info
 *
 * See ARCHITECTURE.md for full design rationale.
 */

// Configuration
export { RefreshIntervals } from './config';

// Provider
export { SWRProvider } from './SWRProvider';

// Client management
export { getPublicClient } from './chains';

// Utilities
export {
  normalizeAddress,
  serializeArgs,
  toReadResult,
  type ReadResult,
} from './utils';

// Error types (re-exported from lib/errors for convenience)
export type { CategorizedError } from '../errors';

// Hooks
export { useMultiChainRead, type UseMultiChainReadOptions } from './useMultiChainRead';
export {
  useMultiChainBatchRead,
  type UseMultiChainBatchReadOptions,
  type BatchContract,
} from './useMultiChainBatchRead';
export {
  useCrossChainRead,
  type UseCrossChainReadOptions,
  type CrossChainContract,
  type CrossChainResult,
} from './useCrossChainRead';

// Cache invalidation
export {
  invalidateUserReads,
  invalidateContractRead,
  invalidateCrossChainReads,
  invalidateBatchReads,
} from './invalidation';
