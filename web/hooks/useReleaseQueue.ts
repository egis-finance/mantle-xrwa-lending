'use client';

import React from 'react';
import useSWR from 'swr';
import { formatUnits, type Address, type Hash } from 'viem';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';
import { getMarketId } from '@/lib/marketId';
import { RefreshIntervals } from '@/lib/swr/config';
import { useSDKReady } from './useSDKReady';
import { useDynamicWallet } from './useDynamicWallet';

export interface ReleaseRequest {
  borrower: Address;
  lockedAmount: string;
  lockedAmountRaw: bigint;
  debtShares: bigint;
  status: 'ready' | 'waiting' | 'released';
  lastLockId: Hash;
}

/**
 * Hook to fetch and manage the "Release Queue".
 * Scans for borrowers who have locked USDY on Mantle but have 0 debt on Ethereum.
 */
export function useReleaseQueue() {
  const sdkReady = useSDKReady();
  const marketId = getMarketId();
  
  const isConfigured = 
    contracts.collateralLocker.address !== UNCONFIGURED_ADDRESS &&
    contracts.morpho.address !== UNCONFIGURED_ADDRESS &&
    marketId !== UNCONFIGURED_ADDRESS;

  const { address: userAddress } = useDynamicWallet();

  // 1. Fetch all unique borrowers and their last lockId from Locked events on Mantle
  const { data: borrowersMap, isLoading: isEventsLoading, error: eventsError } = useSWR(
    sdkReady && isConfigured ? ['release-queue-borrowers-map'] : null,
    async () => {
      const publicClient = getPublicClient(MANTLE_CHAIN_ID);
      
      try {
        // Limit block range for performance/stability (2M blocks for broader discovery)
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 2000000n ? currentBlock - 2000000n : 0n;

        const logs = await publicClient.getLogs({
          address: contracts.collateralLocker.address,
          event: {
            type: 'event',
            name: 'Locked',
            inputs: [
              { name: 'borrower', type: 'address', indexed: true },
              { name: 'lockId', type: 'bytes32', indexed: true },
              { name: 'amount', type: 'uint256', indexed: false },
              { name: 'sourceChainId', type: 'uint256', indexed: false },
              { name: 'validUntil', type: 'uint64', indexed: false },
              { name: 'vcHash', type: 'bytes32', indexed: false },
            ],
          },
          fromBlock,
        });

        const map = new Map<Address, Hash>();
        logs.forEach(log => {
          if (log.args.borrower && log.args.lockId) {
            map.set(log.args.borrower, log.args.lockId);
          }
        });

        return map;
      } catch (err) {
        console.error('Error fetching Locked events:', err);
        return new Map<Address, Hash>();
      }
    },
    { refreshInterval: RefreshIntervals.PROTOCOL_TVL }
  );

  // 2. Combine discovered borrowers with current user
  const borrowers = React.useMemo(() => {
    const set = new Set<Address>(borrowersMap ? Array.from(borrowersMap.keys()) : []);
    if (userAddress) set.add(userAddress);
    return Array.from(set);
  }, [borrowersMap, userAddress]);

  const { data: queue, isLoading: isBalancesLoading, error: balancesError, mutate: refetch } = useSWR(
    borrowers.length > 0 ? ['release-queue-data', borrowers] : null,
    async () => {
      if (!borrowers) return [];

      const mantleClient = getPublicClient(MANTLE_CHAIN_ID);
      const ethClient = getPublicClient(ETHEREUM_CHAIN_ID);

      const results = await Promise.all(
        borrowers.map(async (borrower) => {
          try {
            const lockedBalance = await mantleClient.readContract({
              address: contracts.collateralLocker.address,
              abi: CollateralLockerAbi,
              functionName: 'getUserLockedBalance',
              args: [borrower],
            }) as bigint;

            if (lockedBalance === 0n) return null;

            const position = await ethClient.readContract({
              address: contracts.morpho.address,
              abi: MorphoAbi,
              functionName: 'position',
              args: [marketId as `0x${string}`, borrower],
            }) as [bigint, bigint, bigint];

            const debtShares = position[1];

            return {
              borrower,
              lockedAmountRaw: lockedBalance,
              lockedAmount: formatUnits(lockedBalance, 18),
              debtShares,
              status: debtShares === 0n ? 'ready' : 'waiting',
              lastLockId: (borrowersMap?.get(borrower)) || '0x0000000000000000000000000000000000000000000000000000000000000000',
            } as ReleaseRequest;
          } catch (err) {
            console.error(`Error fetching data for borrower ${borrower}:`, err);
            return null;
          }
        })
      );

      return results.filter((r): r is ReleaseRequest => r !== null);
    },
    { refreshInterval: RefreshIntervals.USER_POSITION }
  );

  const isLoading = (isEventsLoading || isBalancesLoading) && !eventsError && !balancesError;

  return {
    requests: queue ?? [],
    isLoading: isConfigured ? isLoading : false,
    isError: !!eventsError || !!balancesError,
    refetch,
  };
}

