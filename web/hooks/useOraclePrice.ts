'use client';

import { formatUnits } from 'viem';
import { useMultiChainRead, useMultiChainBatchRead, type ReadResult, RefreshIntervals } from '@/lib/swr';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { OracleAbi } from '@/lib/contracts/abis/Oracle';

interface OraclePriceResult {
  value: string | null;
  haircutPercentage: number | null;
  isStale: boolean | null;
  raw: bigint | undefined;
}

/**
 * Reads oracle price, haircut, and staleness from NAVOracle on Ethereum.
 *
 * Uses getPriceWithHaircut() instead of price() to avoid staleness revert:
 * - price() reverts when oracle is stale (Morpho's safety mechanism)
 * - getPriceWithHaircut() returns the same value but never reverts
 * This allows UI to display the price with a "stale" warning instead of breaking.
 *
 * Price + isStale are batched (both change over time with 10s polling).
 * HAIRCUT_BPS is fetched separately as one-time static read.
 */
export function useOraclePrice(): ReadResult<OraclePriceResult> {
  const isConfigured = contracts.navOracle.address !== UNCONFIGURED_ADDRESS;

  // Batch: getPriceWithHaircut + isStale (both dynamic, poll every 10s)
  const batchResult = useMultiChainBatchRead<[bigint, boolean]>({
    chainId: contracts.navOracle.chainId,
    contracts: [
      {
        address: contracts.navOracle.address,
        abi: OracleAbi,
        functionName: 'getPriceWithHaircut',
        args: [],
      },
      {
        address: contracts.navOracle.address,
        abi: OracleAbi,
        functionName: 'isStale',
        args: [],
      },
    ],
    enabled: isConfigured,
    refreshInterval: RefreshIntervals.ORACLE_PRICE,
  });

  // Separate: HAIRCUT_BPS (static configuration, fetch once)
  const haircutResult = useMultiChainRead<typeof OracleAbi, 'HAIRCUT_BPS', bigint>({
    chainId: contracts.navOracle.chainId,
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'HAIRCUT_BPS',
    args: [],
    enabled: isConfigured,
    revalidateOnFocus: false, // Never refetch - static config
  });

  // Combine results
  const transformedData: OraclePriceResult | undefined = (() => {
    const [priceData, isStale] = batchResult.data ?? [undefined, undefined];

    // Morpho oracle precision: 10^(36 + loanDecimals - collateralDecimals)
    // For USDC (6) / AcUSDY (18): 10^(36 + 6 - 18) = 10^24
    const priceValue = priceData !== undefined ? formatUnits(priceData, 24) : null;

    // Calculate haircut percentage (e.g., 200 BPS = 2%)
    const haircutPercentage = haircutResult.data !== undefined
      ? Number(haircutResult.data) / 100
      : null;

    return {
      value: priceValue,
      haircutPercentage,
      isStale: isStale ?? null,
      raw: priceData,
    };
  })();

  // Loading state: both requests must complete
  const isLoading = batchResult.isLoading || haircutResult.isLoading;
  const isError = batchResult.isError || haircutResult.isError;
  const isRefetching = batchResult.isRefetching || haircutResult.isRefetching;

  return {
    data: transformedData,
    isLoading,
    isError,
    error: batchResult.error ?? haircutResult.error ?? null,
    isRefetching,
    refetch: async () => {
      await Promise.all([batchResult.refetch(), haircutResult.refetch()]);
    },
  };
}
