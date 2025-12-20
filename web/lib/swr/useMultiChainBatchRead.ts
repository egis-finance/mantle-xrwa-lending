'use client';

import useSWR from 'swr';
import type { Address, Abi } from 'viem';
import { useSDKReady } from '@/hooks/useSDKReady';
import { getPublicClient } from './chains';
import { normalizeAddress, serializeArgs, toReadResult, type ReadResult } from './utils';

export interface BatchContract {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export interface UseMultiChainBatchReadOptions {
  chainId: number;
  contracts: BatchContract[];
  enabled?: boolean;
  refreshInterval?: number;
  revalidateOnFocus?: boolean;
}

/**
 * SWR-based hook for batched contract reads via multicall.
 * Groups multiple reads on the same chain into a single RPC call.
 */
export function useMultiChainBatchRead<TData extends readonly unknown[] = readonly unknown[]>({
  chainId,
  contracts,
  enabled = true,
  refreshInterval,
  revalidateOnFocus,
}: UseMultiChainBatchReadOptions): ReadResult<TData> {
  // Defer reads until SDK is ready (prevents failed requests during initialization)
  const sdkReady = useSDKReady();

  // Cache key: include chainId and serialized contract calls
  // Only create key when SDK ready AND enabled - null key prevents fetch
  const cacheKey = (sdkReady && enabled)
    ? [
        'batch',
        chainId,
        ...contracts.map((c) =>
          [normalizeAddress(c.address), c.functionName, serializeArgs(c.args ?? [])].join(':')
        ),
      ]
    : null;

  const swrResult = useSWR<TData, Error>(
    cacheKey,
    async () => {
      const client = getPublicClient(chainId);
      const results = await client.multicall({
        contracts: contracts.map((c) => ({
          address: c.address,
          abi: c.abi,
          functionName: c.functionName,
          args: c.args,
        })),
        allowFailure: false,
      });
      return results as unknown as TData;
    },
    {
      ...(refreshInterval !== undefined && { refreshInterval }),
      ...(revalidateOnFocus !== undefined && { revalidateOnFocus }),
    }
  );

  // Pass combined enabled state so isLoading reflects SDK ready + user enabled
  return toReadResult(swrResult, sdkReady && enabled);
}
