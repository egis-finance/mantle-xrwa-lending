'use client';

import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useMultiChainBatchRead } from '@/lib/swr/useMultiChainBatchRead';
import { RefreshIntervals } from '@/lib/swr/config';
import type { ReadResult } from '@/lib/swr/utils';
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

interface LenderPositionResult {
  suppliedValue: string | null;
  suppliedRaw: bigint;  // Raw BigInt for exact validation (USDC 6 decimals)
  supplyShares: bigint;
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
}

interface LenderPositionOptions {
  enabled?: boolean;
}

/**
 * Reads lender's supplied assets from Morpho position on Ethereum.
 * Uses batch read for position + market data in single multicall.
 */
export function useLenderPosition(
  lenderAddress: Address | undefined,
  options?: LenderPositionOptions
): ReadResult<LenderPositionResult> {
  const marketId = getMarketId();
  const isConfigured = contracts.morpho.address !== UNCONFIGURED_ADDRESS;
  const enabledFlag = options?.enabled ?? true;
  const enabled = Boolean(lenderAddress) && marketId !== UNCONFIGURED_ADDRESS && isConfigured && enabledFlag;

  const result = useMultiChainBatchRead<[MorphoPosition, MorphoMarket]>({
    chainId: contracts.morpho.chainId,
    contracts: [
      {
        address: contracts.morpho.address,
        abi: MorphoAbi,
        functionName: 'position',
        args: [marketId as `0x${string}`, lenderAddress!],
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

  // Calculate supplied value from position and market data
  const transformedData: LenderPositionResult | undefined = (() => {
    if (!result.data) return undefined;

    const [position, market] = result.data;
    if (!position || !market) return undefined;

    // Calculate supplied assets from shares: (supplyShares * totalSupplyAssets) / totalSupplyShares
    let suppliedRaw = 0n;
    if (position.supplyShares > 0n && market.totalSupplyShares > 0n) {
      suppliedRaw = (position.supplyShares * market.totalSupplyAssets) / market.totalSupplyShares;
    }
    const suppliedValue = formatUnits(suppliedRaw, 6);

    return {
      suppliedValue,
      suppliedRaw,
      supplyShares: position.supplyShares,
      totalSupplyAssets: market.totalSupplyAssets,
      totalSupplyShares: market.totalSupplyShares,
    };
  })();

  return {
    ...result,
    data: transformedData,
  };
}
