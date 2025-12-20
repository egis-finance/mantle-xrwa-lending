'use client';

import { formatUnits } from 'viem';
import { useMultiChainBatchRead, RefreshIntervals } from '@/lib/swr';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { getMarketId } from '@/lib/marketId';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';
import { useOraclePrice } from './useOraclePrice';

interface MorphoMarketParams {
  loanToken: `0x${string}`;
  collateralToken: `0x${string}`;
  oracle: `0x${string}`;
  irm: `0x${string}`;
  lltv: bigint;
}

interface MorphoMarket {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export interface SystemParams {
  // Market Parameters
  lltv: number | null;
  lltvPercentage: string | null;

  // Liquidation Parameters
  liquidationThreshold: number | null;
  liquidationThresholdPercentage: string | null;
  liquidationBonus: number | null;
  liquidationBonusPercentage: string | null;

  // Market Stats
  totalSupply: string | null;
  totalBorrow: string | null;
  availableLiquidity: string | null;
  utilizationRate: number | null;

  // Protocol Fee
  fee: number | null;
  feePercentage: string | null;

  // Oracle
  oraclePrice: string | null;
  oracleAddress: string | null;
  oracleHaircutPercentage: number | null;
  oracleIsStale: boolean | null;

  // Timestamps
  lastUpdate: number | null;

  // Loading states
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Reads Morpho market parameters and statistics.
 * idToMarketParams + market batched for efficiency.
 */
export function useSystemParams(): SystemParams {
  const marketId = getMarketId();
  const isConfigured = contracts.morpho.address !== UNCONFIGURED_ADDRESS && marketId !== UNCONFIGURED_ADDRESS;
  const oraclePrice = useOraclePrice();

  // Batch: idToMarketParams (static) + market (dynamic)
  const batchResult = useMultiChainBatchRead<[MorphoMarketParams, MorphoMarket]>({
    chainId: contracts.morpho.chainId,
    contracts: [
      {
        address: contracts.morpho.address,
        abi: MorphoAbi,
        functionName: 'idToMarketParams',
        args: [marketId as `0x${string}`],
      },
      {
        address: contracts.morpho.address,
        abi: MorphoAbi,
        functionName: 'market',
        args: [marketId as `0x${string}`],
      },
    ],
    enabled: isConfigured,
    refreshInterval: RefreshIntervals.SYSTEM_PARAMS,
  });

  const isLoading = batchResult.isLoading || oraclePrice.isLoading;
  const isError = batchResult.isError || oraclePrice.isError;

  // Parse results
  const [marketParams, marketData] = batchResult.data ?? [undefined, undefined];

  const lltv = marketParams && marketParams.lltv > 0n
    ? Number(formatUnits(marketParams.lltv, 18))
    : 0;
  const lltvPercentage = lltv !== null ? `${(lltv * 100).toFixed(0)}%` : null;

  const totalSupply = marketData ? formatUnits(marketData.totalSupplyAssets, 6) : null;
  const totalBorrow = marketData ? formatUnits(marketData.totalBorrowAssets, 6) : null;

  const utilizationRate = totalSupply && totalBorrow && parseFloat(totalSupply) > 0
    ? (parseFloat(totalBorrow) / parseFloat(totalSupply)) * 100
    : 0;

  // In Morpho Blue, liquidation happens at LLTV
  const liquidationThreshold = lltv;
  const liquidationThresholdPercentage = lltvPercentage;

  // Liquidation bonus: (1/LLTV - 1)
  const liquidationBonus = lltv && lltv > 0 ? (1 / lltv) - 1 : null;
  const liquidationBonusPercentage = liquidationBonus !== null
    ? `${(liquidationBonus * 100).toFixed(0)}%`
    : null;

  const availableLiquidity = totalSupply && totalBorrow
    ? (parseFloat(totalSupply) - parseFloat(totalBorrow)).toString()
    : null;

  const fee = marketData && marketData.fee > 0n ? Number(formatUnits(marketData.fee, 18)) : 0;
  const feePercentage = fee !== null ? `${(fee * 100).toFixed(2)}%` : null;

  const lastUpdate = marketData && marketData.lastUpdate > 0n ? Number(marketData.lastUpdate) : null;

  const oracleAddress = marketParams?.oracle ?? contracts.navOracle.address;

  return {
    lltv,
    lltvPercentage,
    liquidationThreshold,
    liquidationThresholdPercentage,
    liquidationBonus,
    liquidationBonusPercentage,
    totalSupply,
    totalBorrow,
    availableLiquidity,
    utilizationRate,
    fee,
    feePercentage,
    oraclePrice: oraclePrice.data?.value ?? null,
    oracleAddress,
    oracleHaircutPercentage: oraclePrice.data?.haircutPercentage ?? null,
    oracleIsStale: oraclePrice.data?.isStale ?? null,
    lastUpdate,
    isLoading,
    isError,
    refetch: () => {
      batchResult.refetch();
      oraclePrice.refetch();
    },
  };
}
