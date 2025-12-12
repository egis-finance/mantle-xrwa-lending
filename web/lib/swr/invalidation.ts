import { mutate } from 'swr';
import type { Address } from 'viem';
import { normalizeAddress } from './utils';

/**
 * Invalidate all cached reads that include the user's address.
 * Call after transactions that affect user positions.
 */
export async function invalidateUserReads(userAddress: Address): Promise<void> {
  const normalizedUser = normalizeAddress(userAddress);
  await mutate(
    (key) =>
      Array.isArray(key) &&
      key.some((k) => typeof k === 'string' && k.includes(normalizedUser)),
    undefined,
    { revalidate: true }
  );
}

/**
 * Invalidate a specific contract read by chainId, address, and function name.
 */
export function invalidateContractRead(
  chainId: number,
  address: Address,
  functionName: string
): void {
  const normalizedAddr = normalizeAddress(address);
  mutate((key) =>
    Array.isArray(key) &&
    key[0] === 'contract' &&
    key[1] === chainId &&
    key[2] === normalizedAddr &&
    key[3] === functionName
  );
}

/**
 * Invalidate all cross-chain reads (e.g., after lock/mint operations).
 */
export function invalidateCrossChainReads(): void {
  mutate((key) => Array.isArray(key) && key[0] === 'cross-chain');
}

/**
 * Invalidate all batch reads on a specific chain.
 */
export function invalidateBatchReads(chainId: number): void {
  mutate((key) => Array.isArray(key) && key[0] === 'batch' && key[1] === chainId);
}
