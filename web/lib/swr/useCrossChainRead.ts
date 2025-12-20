'use client';

import useSWR from 'swr';
import type { Address, Abi } from 'viem';
import { useSDKReady } from '@/hooks/useSDKReady';
import { MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID } from '@/lib/dynamic/chains';
import { getPublicClient } from './chains';
import { normalizeAddress, serializeArgs, toReadResult, type ReadResult } from './utils';

export interface CrossChainContract {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export interface CrossChainResult<TMantleData, TEthereumData> {
  mantle: TMantleData;
  ethereum: TEthereumData;
}

export interface UseCrossChainReadOptions {
  mantleContract: CrossChainContract;
  ethereumContract: CrossChainContract;
  enabled?: boolean;
  refreshInterval?: number;
  revalidateOnFocus?: boolean;
}

/**
 * SWR-based hook for atomic cross-chain reads.
 * Fetches from both Mantle and Ethereum in parallel, ensuring values are from the same polling cycle.
 * If either RPC fails, the entire read fails (intentional for loan health - partial data is dangerous).
 */
export function useCrossChainRead<TMantleData = unknown, TEthereumData = unknown>({
  mantleContract,
  ethereumContract,
  enabled = true,
  refreshInterval,
  revalidateOnFocus,
}: UseCrossChainReadOptions): ReadResult<
  CrossChainResult<TMantleData, TEthereumData>
> {
  // Defer reads until SDK is ready (prevents failed requests during initialization)
  const sdkReady = useSDKReady();

  // Cache key: include both chain IDs, normalized addresses, function names, args
  // Only create key when SDK ready AND enabled - null key prevents fetch
  const cacheKey = (sdkReady && enabled)
    ? [
        'cross-chain',
        MANTLE_CHAIN_ID,
        normalizeAddress(mantleContract.address),
        mantleContract.functionName,
        serializeArgs(mantleContract.args ?? []),
        ETHEREUM_CHAIN_ID,
        normalizeAddress(ethereumContract.address),
        ethereumContract.functionName,
        serializeArgs(ethereumContract.args ?? []),
      ]
    : null;

  const swrResult = useSWR<CrossChainResult<TMantleData, TEthereumData>, Error>(
    cacheKey,
    async () => {
      const [mantleResult, ethereumResult] = await Promise.all([
        getPublicClient(MANTLE_CHAIN_ID).readContract({
          address: mantleContract.address,
          abi: mantleContract.abi,
          functionName: mantleContract.functionName,
          args: mantleContract.args,
        }) as Promise<TMantleData>,
        getPublicClient(ETHEREUM_CHAIN_ID).readContract({
          address: ethereumContract.address,
          abi: ethereumContract.abi,
          functionName: ethereumContract.functionName,
          args: ethereumContract.args,
        }) as Promise<TEthereumData>,
      ]);

      return {
        mantle: mantleResult,
        ethereum: ethereumResult,
      };
    },
    {
      ...(refreshInterval !== undefined && { refreshInterval }),
      ...(revalidateOnFocus !== undefined && { revalidateOnFocus }),
    }
  );

  // Pass combined enabled state so isLoading reflects SDK ready + user enabled
  return toReadResult(swrResult, sdkReady && enabled);
}
