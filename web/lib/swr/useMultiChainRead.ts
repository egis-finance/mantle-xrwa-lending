'use client';

import useSWR from 'swr';
import type { Address, Abi } from 'viem';
import { useSDKReady } from '@/hooks/useSDKReady';
import { getPublicClient } from './chains';
import { normalizeAddress, serializeArgs, toReadResult, type ReadResult } from './utils';

export interface UseMultiChainReadOptions<TAbi extends Abi, TFunctionName extends string> {
  chainId: number;
  address: Address;
  abi: TAbi;
  functionName: TFunctionName;
  args?: readonly unknown[];
  enabled?: boolean;
  refreshInterval?: number;
  revalidateOnFocus?: boolean;
}

/**
 * SWR-based hook for single contract reads.
 * Replaces wagmi's useReadContract with consistent return shape.
 */
export function useMultiChainRead<
  TAbi extends Abi,
  TFunctionName extends string,
  TData = unknown
>({
  chainId,
  address,
  abi,
  functionName,
  args = [],
  enabled = true,
  refreshInterval,
  revalidateOnFocus,
}: UseMultiChainReadOptions<TAbi, TFunctionName>): ReadResult<TData> {
  // Defer reads until SDK is ready (prevents failed requests during initialization)
  const sdkReady = useSDKReady();

  // Cache key: include chainId, normalized address, functionName, serialized args
  // Only create key when SDK ready AND enabled - null key prevents fetch
  const cacheKey = (sdkReady && enabled)
    ? ['contract', chainId, normalizeAddress(address), functionName, serializeArgs(args)]
    : null;

  const swrResult = useSWR<TData, Error>(
    cacheKey,
    async () => {
      const client = getPublicClient(chainId);

      const params = {
        address,
        abi,
        functionName,
        args,
      } as unknown as Parameters<typeof client.readContract>[0];

      return client.readContract(params) as Promise<TData>;
    },
    {
      ...(refreshInterval !== undefined && { refreshInterval }),
      ...(revalidateOnFocus !== undefined && { revalidateOnFocus }),
    }
  );

  // Pass combined enabled state so isLoading reflects SDK ready + user enabled
  return toReadResult(swrResult, sdkReady && enabled);
}
