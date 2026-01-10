'use client';

import React from 'react';
import useSWR from 'swr';
import { formatUnits, type Address, type Hash } from 'viem';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';
import { getMarketId } from '@/lib/marketId';
import { RefreshIntervals } from '@/lib/swr/config';
import { useSDKReady } from './useSDKReady';
import { useOraclePrice } from './useOraclePrice';
import { useDynamicWallet } from './useDynamicWallet';

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
  debtRaw: bigint;
  collateralRaw: bigint;
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

  // 1. Fetch unique borrowers from Mantle (scan more blocks for discovery)
  const { data: discoveredBorrowers, isLoading: isDiscoveryLoading } = useSWR(
    sdkReady && isConfigured ? ['liquidation-radar-borrowers'] : null,
    async () => {
      const publicClient = getPublicClient(MANTLE_CHAIN_ID);
      try {
        // Scan a much larger range for discovery (2M blocks ~ 45 days on Mantle)
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
        return Array.from(unique);
      } catch (err) {
        console.error('Radar discovery error:', err);
        return [];
      }
    },
    { refreshInterval: RefreshIntervals.PROTOCOL_TVL }
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

              // Convert shares to assets: (shares * totalAssets) / totalShares
              let debtAmount = 0n;
              if (market.totalBorrowShares > 0n) {
                debtAmount = (borrowShares * market.totalBorrowAssets) / market.totalBorrowShares;
              } else {
                debtAmount = borrowShares; // Fallback for 1:1 initial state
              }
              
              // HF = (Collateral * OraclePrice * LLTV) / Debt
              const collateralValue = Number(formatUnits(collateral, 18)) * oraclePrice;
              const debtValue = Number(formatUnits(debtAmount, 6)); 
              
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
                debtRaw: borrowShares,
                collateralRaw: collateral,
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
    refetch,
  };
}
