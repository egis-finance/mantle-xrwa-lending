'use client';

import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useMultiChainBatchRead, type ReadResult, RefreshIntervals } from '@/lib/swr';
import { contracts } from '@/lib/contracts';
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
  const isConfigured = contracts.morpho.address !== '0x0';
  const enabled = Boolean(borrowerAddress) && marketId !== '0x0' && isConfigured;

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

    // Calculate debt from shares
    let debtValue: string | null = null;
    if (position.borrowShares === 0n) {
      debtValue = '0';
    } else if (market.totalBorrowShares > 0n) {
      // (borrowShares * totalBorrowAssets) / totalBorrowShares (USDC has 6 decimals)
      const debtAmount = (position.borrowShares * market.totalBorrowAssets) / market.totalBorrowShares;
      debtValue = formatUnits(debtAmount, 6);
    }

    return {
      value: debtValue,
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
