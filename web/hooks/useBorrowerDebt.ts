'use client';

import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useMultiChainBatchRead, type ReadResult, RefreshIntervals } from '@/lib/swr';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { getMarketId } from '@/lib/marketId';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';

interface MorphoPosition {
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

interface MorphoMarket {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

interface BorrowerDebtResult {
  value: string | null;
  debtAssetsRaw: bigint | null; // null when unknown, 0n when no debt, >0n when has debt
  borrowShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
}

/**
 * Reads borrower's debt from Morpho position on Ethereum.
 * Uses batch read for position + market data in single multicall.
 */
export function useBorrowerDebt(
  borrowerAddress: Address | undefined
): ReadResult<BorrowerDebtResult> {
  const marketId = getMarketId();
  const isConfigured = contracts.morpho.address !== UNCONFIGURED_ADDRESS;
  const enabled = Boolean(borrowerAddress) && marketId !== UNCONFIGURED_ADDRESS && isConfigured;

  const result = useMultiChainBatchRead<[MorphoPosition, MorphoMarket]>({
    chainId: contracts.morpho.chainId,
    contracts: [
      {
        address: contracts.morpho.address,
        abi: MorphoAbi,
        functionName: 'position',
        args: [marketId as `0x${string}`, borrowerAddress!],
      },
      {
        address: contracts.morpho.address,
        abi: MorphoAbi,
        functionName: 'market',
        args: [marketId as `0x${string}`],
      },
    ],
    enabled,
    refreshInterval: RefreshIntervals.USER_POSITION,
  });

  // Calculate debt from position and market data
  const transformedData: BorrowerDebtResult | undefined = (() => {
    if (!result.data) return undefined;

    const [position, market] = result.data;
    if (!position || !market) return undefined;

    // Compute raw debt assets with proper state handling
    const debtAssetsRaw: bigint | null = (() => {
      if (position.borrowShares === 0n) return 0n; // No debt
      if (market.totalBorrowShares === 0n) return null; // Can't compute (impossible state)
      return (position.borrowShares * market.totalBorrowAssets) / market.totalBorrowShares;
    })();

    // Format for display (USDC has 6 decimals)
    const debtValue: string | null =
      debtAssetsRaw === null ? null : formatUnits(debtAssetsRaw, 6);

    return {
      value: debtValue,
      debtAssetsRaw,
      borrowShares: position.borrowShares,
      totalBorrowAssets: market.totalBorrowAssets,
      totalBorrowShares: market.totalBorrowShares,
    };
  })();

  return {
    ...result,
    data: transformedData,
  };
}
