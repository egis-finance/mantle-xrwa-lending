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

// Chunked scanning to avoid RPC timeouts on large block ranges
const LOG_LOOKBACK_BLOCKS = 2_000_000n;
const LOG_CHUNK_SIZE = 50_000n;

// Hard cap on results to prevent unbounded memory growth
const MAX_RELEASE_QUEUE_RESULTS = 50;
const BORROWERS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const LOCKED_EVENT = {
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
} as const;

interface BorrowersCache {
  entries: [Address, Hash][];
  timestamp: number;
  lastScannedBlock?: string;
}

function getBorrowersCacheKey(): string {
  return `egis-release-queue-${MANTLE_CHAIN_ID}-${contracts.collateralLocker.address}`;
}

function getCachedBorrowers(): BorrowersCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(getBorrowersCacheKey());
    if (!cached) return null;
    return JSON.parse(cached) as BorrowersCache;
  } catch {
    return null;
  }
}

function setCachedBorrowers(map: Map<Address, Hash>, lastScannedBlock?: bigint): void {
  if (typeof window === 'undefined') return;
  try {
    const cache: BorrowersCache = {
      entries: Array.from(map.entries()),
      timestamp: Date.now(),
      lastScannedBlock: lastScannedBlock ? lastScannedBlock.toString() : undefined,
    };
    localStorage.setItem(getBorrowersCacheKey(), JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

function parseOptionalBigInt(value: string | undefined): bigint | null {
  if (!value) return null;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

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
  // Uses chunked scanning to avoid RPC timeouts on large block ranges
  const { data: borrowersMap, isLoading: isEventsLoading, error: eventsError } = useSWR(
    sdkReady && isConfigured ? ['release-queue-borrowers-map'] : null,
    async () => {
      const publicClient = getPublicClient(MANTLE_CHAIN_ID);
      const cached = getCachedBorrowers();
      const isCacheFresh = cached ? Date.now() - cached.timestamp <= BORROWERS_CACHE_TTL : false;
      const map = new Map<Address, Hash>(cached?.entries ?? []);

      try {
        const currentBlock = await publicClient.getBlockNumber();
        const defaultFromBlock = currentBlock > LOG_LOOKBACK_BLOCKS ? currentBlock - LOG_LOOKBACK_BLOCKS : 0n;
        const cachedLastScanned = isCacheFresh ? parseOptionalBigInt(cached?.lastScannedBlock) : null;

        if (cachedLastScanned !== null && cachedLastScanned >= currentBlock) {
          setCachedBorrowers(map, cachedLastScanned);
          return map;
        }

        const fromBlock = cachedLastScanned !== null ? cachedLastScanned + 1n : defaultFromBlock;
        let startBlock = fromBlock > currentBlock ? currentBlock : fromBlock;

        // Scan in chunks to avoid RPC timeouts
        while (startBlock <= currentBlock) {
          const endBlock = startBlock + LOG_CHUNK_SIZE - 1n;
          const chunkToBlock = endBlock > currentBlock ? currentBlock : endBlock;

          const logs = await publicClient.getLogs({
            address: contracts.collateralLocker.address,
            event: LOCKED_EVENT,
            fromBlock: startBlock,
            toBlock: chunkToBlock,
          });

          logs.forEach(log => {
            if (log.args.borrower && log.args.lockId) {
              map.set(log.args.borrower, log.args.lockId);
            }
          });

          startBlock = chunkToBlock + 1n;
        }

        setCachedBorrowers(map, currentBlock);
        return map;
      } catch (err) {
        console.error('Error fetching Locked events:', err);
        return map;
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
            }) as { supplyShares: bigint; borrowShares: bigint; collateral: bigint };

            const debtShares = position.borrowShares;

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

      // Sort by status (ready first), then by lockId descending (most recent first)
      // Slice to prevent unbounded growth over time
      return results
        .filter((r): r is ReleaseRequest => r !== null)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'ready' ? -1 : 1;
          return b.lastLockId.localeCompare(a.lastLockId);
        })
        .slice(0, MAX_RELEASE_QUEUE_RESULTS);
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
