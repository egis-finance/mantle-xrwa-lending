'use client';

import React from 'react';
import useSWR from 'swr';
import { formatUnits, type Address } from 'viem';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';
import { getMarketId } from '@/lib/marketId';
import { RefreshIntervals } from '@/lib/swr/config';
import { useSDKReady } from './useSDKReady';
import { useOraclePrice } from './useOraclePrice';
import { useDynamicWallet } from './useDynamicWallet';

// Cache discovered borrowers locally to avoid rescanning 2M blocks on every load
// Cache key scoped by chain + contracts to isolate VTE vs mainnet environments
const BORROWERS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getBorrowersCacheKey(): string {
  return `egis-borrowers-${MANTLE_CHAIN_ID}-${contracts.collateralLocker.address}-${contracts.morpho.address}`;
}

interface BorrowersCache {
  borrowers: Address[];
  timestamp: number;
}

function getCachedBorrowers(): Address[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(getBorrowersCacheKey());
    if (!cached) return null;
    const { borrowers, timestamp } = JSON.parse(cached) as BorrowersCache;
    if (Date.now() - timestamp > BORROWERS_CACHE_TTL) return null;
    return borrowers;
  } catch {
    return null;
  }
}

function setCachedBorrowers(borrowers: Address[]): void {
  if (typeof window === 'undefined') return;
  try {
    const cache: BorrowersCache = { borrowers, timestamp: Date.now() };
    localStorage.setItem(getBorrowersCacheKey(), JSON.stringify(cache));
  } catch {
    // Storage quota exceeded or private browsing - ignore
  }
}

/** Clear borrowers cache - exposed for manual rescan functionality */
export function clearBorrowersCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getBorrowersCacheKey());
  } catch {
    // Ignore storage errors
  }
}

interface MorphoMarket {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export interface BorrowerPosition {
  borrower: Address;
  healthFactor: number | null;
  debtValue: string;
  /** Raw debt shares from Morpho position() - used as repaidShares in liquidate() */
  borrowShares: bigint;
  /** Ceiling-rounded debt in USDC (6 decimals) - matches Morpho's toAssetsUp for display */
  debtAssets: bigint;
  /** Raw collateral amount (18 decimals) - informational only, not used in liquidate() */
  collateral: bigint;
  riskLevel: 'safe' | 'warning' | 'danger' | 'liquidatable';
}

/**
 * Hook to fetch and monitor all active borrower positions for potential liquidations.
 * Scans historical Mantle events to find borrowers, then checks their live Ethereum state.
 */
export function useLiquidationRadar(lltv: number = 0.86) {
  const sdkReady = useSDKReady();
  const marketId = getMarketId();
  const { data: oracleData } = useOraclePrice();

  const isConfigured = 
    contracts.collateralLocker.address !== UNCONFIGURED_ADDRESS &&
    contracts.morpho.address !== UNCONFIGURED_ADDRESS &&
    marketId !== UNCONFIGURED_ADDRESS;

  const { address: userAddress } = useDynamicWallet();

  // Track rescan with local state (SWR's isValidating fires on all revalidations, not just rescan)
  const [isRescanning, setIsRescanning] = React.useState(false);

  // Gate rescan availability on whether discovery is enabled
  const canRescan = sdkReady && isConfigured;

  // 1. Fetch unique borrowers from Mantle (with localStorage caching)
  const { data: discoveredBorrowers, isLoading: isDiscoveryLoading, mutate: mutateDiscovery } = useSWR(
    sdkReady && isConfigured ? ['liquidation-radar-borrowers'] : null,
    async () => {
      // Check cache first - avoids rescanning 2M blocks on every page load
      const cached = getCachedBorrowers();
      if (cached && cached.length > 0) {
        return cached;
      }

      const publicClient = getPublicClient(MANTLE_CHAIN_ID);
      try {
        // Full historical scan only on cache miss (2M blocks ~ 45 days on Mantle)
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

        const unique = new Set<Address>();
        logs.forEach(log => { if (log.args.borrower) unique.add(log.args.borrower); });
        const borrowers = Array.from(unique);

        // Cache results for future page loads
        setCachedBorrowers(borrowers);
        return borrowers;
      } catch (err) {
        console.error('Radar discovery error:', err);
        return [];
      }
    },
    { refreshInterval: 0 } // Don't auto-refresh discovery - use manual refetch or cache expiry
  );

  // 2. Combine discovered borrowers with current user for immediate visibility
  const borrowers = React.useMemo(() => {
    const set = new Set<Address>(discoveredBorrowers ?? []);
    if (userAddress) set.add(userAddress);
    return Array.from(set);
  }, [discoveredBorrowers, userAddress]);

  // 3. Fetch live Morpho state for all discovered borrowers + market data for debt conversion
  const { data: positions, isLoading: isRadarLoading, mutate: refetch } = useSWR(
    borrowers.length > 0 && oracleData?.value ? ['liquidation-radar-data', borrowers, oracleData.value] : null,
    async () => {
      if (!borrowers || !oracleData?.value) return [];

      const ethClient = getPublicClient(ETHEREUM_CHAIN_ID);
      const oraclePrice = parseFloat(oracleData.value);

      try {
        // Fetch market state once for all debt conversions
        const market = await ethClient.readContract({
          address: contracts.morpho.address,
          abi: MorphoAbi,
          functionName: 'market',
          args: [marketId as `0x${string}`],
        }) as MorphoMarket;

        const results = await Promise.all(
          borrowers.map(async (borrower) => {
            try {
              const position = await ethClient.readContract({
                address: contracts.morpho.address,
                abi: MorphoAbi,
                functionName: 'position',
                args: [marketId as `0x${string}`, borrower],
              }) as { supplyShares: bigint; borrowShares: bigint; collateral: bigint };

              const { borrowShares, collateral } = position;

              // Only track active borrowers
              if (borrowShares === 0n) return null;

              // Convert shares to assets with CEILING rounding (matches Morpho's toAssetsUp)
              // ceil(a * b / c) = (a * b + c - 1) / c
              let debtAssets = 0n;
              if (market.totalBorrowShares > 0n) {
                debtAssets = (borrowShares * market.totalBorrowAssets + market.totalBorrowShares - 1n) / market.totalBorrowShares;
              } else {
                debtAssets = borrowShares; // Fallback for 1:1 initial state
              }

              // Use ceiling-rounded debtAssets for display and HF calculation
              // HF = (Collateral * OraclePrice * LLTV) / Debt
              const collateralValue = Number(formatUnits(collateral, 18)) * oraclePrice;
              const debtValue = Number(formatUnits(debtAssets, 6));

              const hf = debtValue > 0 ? (collateralValue * lltv) / debtValue : null;

              let riskLevel: BorrowerPosition['riskLevel'] = 'safe';
              if (hf !== null) {
                if (hf < 1.0) riskLevel = 'liquidatable';
                else if (hf < 1.1) riskLevel = 'danger';
                else if (hf < 1.25) riskLevel = 'warning';
              }

              return {
                borrower,
                healthFactor: hf,
                debtValue: debtValue.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                borrowShares,
                debtAssets,
                collateral,
                riskLevel,
              } as BorrowerPosition;
            } catch (err) {
              console.error(`Radar state error for ${borrower}:`, err);
              return null;
            }
          })
        );

        // Filter nulls and sort by health factor (riskiest first)
        return results
          .filter((p): p is BorrowerPosition => p !== null)
          .sort((a, b) => (a.healthFactor ?? 999) - (b.healthFactor ?? 999));
      } catch (err) {
        console.error('Radar market fetch error:', err);
        return [];
      }
    },
    { refreshInterval: RefreshIntervals.USER_POSITION }
  );

  return {
    positions: positions ?? [],
    isLoading: isDiscoveryLoading || isRadarLoading,
    isDiscovering: isRescanning,
    canRescan,
    refetch,
    rescanBorrowers: async () => {
      if (!canRescan) return;
      setIsRescanning(true);
      try {
        clearBorrowersCache();
        await mutateDiscovery();
      } finally {
        setIsRescanning(false);
      }
    },
  };
}
