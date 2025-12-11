'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import React from 'react'
import { contracts } from '@/lib/contracts'
import { getMarketId } from '@/lib/marketId'
import { MorphoAbi } from '@/lib/contracts/abis/Morpho'
import { useOraclePrice } from './useOraclePrice'

export interface SystemParams {
  // Market Parameters
  lltv: number | null // Max LTV (e.g., 0.75 = 75%)
  lltvPercentage: string | null // Formatted as "75%"

  // Liquidation Parameters
  liquidationThreshold: number | null // Liquidation threshold (typically same as LLTV in Morpho)
  liquidationThresholdPercentage: string | null // Formatted as "75%"
  liquidationBonus: number | null // Liquidation bonus (e.g., 0.05 = 5%)
  liquidationBonusPercentage: string | null // Formatted as "5%"

  // Market Stats
  totalSupply: string | null // Total USDC supplied
  totalBorrow: string | null // Total USDC borrowed
  availableLiquidity: string | null // Available to borrow (supply - borrow)
  utilizationRate: number | null // Borrow / Supply ratio

  // Protocol Fee
  fee: number | null // Protocol fee (e.g., 0.01 = 1%)
  feePercentage: string | null // Formatted as "1%"

  // Oracle
  oraclePrice: string | null // Current collateral price
  oracleAddress: string | null
  oracleHaircutPercentage: number | null // Haircut applied (e.g., 2)
  oracleIsStale: boolean | null // Whether oracle price is stale

  // Timestamps
  lastUpdate: number | null // Last market update timestamp

  // Loading states
  isLoading: boolean
  isError: boolean
}

export function useSystemParams(): SystemParams {
  const marketId = getMarketId()
  const isConfigured = contracts.morpho.address !== '0x0' && marketId !== '0x0'
  const oraclePrice = useOraclePrice()

  // Fetch market parameters (includes LLTV) - STATIC, fetch once only
  const { data: marketParams, isLoading: paramsLoading, isError: paramsError, dataUpdatedAt: paramsUpdatedAt } = useReadContract({
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'idToMarketParams',
    args: [marketId],
    chainId: contracts.morpho.chainId,
    query: {
      staleTime: Infinity, // Never consider stale - system params don't change
      gcTime: Infinity, // Keep in cache forever
      refetchOnMount: false, // Don't refetch on component mount
      refetchOnWindowFocus: false, // Don't refetch when tab regains focus
      refetchOnReconnect: false, // Don't refetch on reconnect
    },
  })


  // Fetch market data (supply, borrow, lastUpdate) - changes as users interact
  const { data: marketData, isLoading: marketLoading, isError: marketError, dataUpdatedAt: marketUpdatedAt } = useReadContract({
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'market',
    args: [marketId],
    chainId: contracts.morpho.chainId,
    query: {
      staleTime: 30000, // Consider stale after 30s
      gcTime: Infinity, // Keep in cache (avoid re-fetch on remount)
      refetchInterval: 30000, // Poll every 30 seconds
      refetchOnWindowFocus: true, // Refresh when user returns to tab
    },
  })

  const isLoading = paramsLoading || marketLoading || oraclePrice.isLoading
  const isError = paramsError || marketError || oraclePrice.isError

  // Parse and calculate values BEFORE logging
  const lltv = marketParams && marketParams.lltv > 0n
    ? Number(formatUnits(marketParams.lltv, 18))
    : 0
  const lltvPercentage = lltv !== null ? `${(lltv * 100).toFixed(0)}%` : null

  const totalSupply = marketData ? formatUnits(marketData.totalSupplyAssets, 6) : null
  const totalBorrow = marketData ? formatUnits(marketData.totalBorrowAssets, 6) : null

  const utilizationRate = totalSupply && totalBorrow && parseFloat(totalSupply) > 0
    ? (parseFloat(totalBorrow) / parseFloat(totalSupply)) * 100
    : 0

  // Debug logging with KPI values
  if (typeof window !== 'undefined') {
    console.log('🔍 useSystemParams Cache Debug:', {
      marketId,
      LOADING_STATE: {
        paramsLoading,
        marketLoading,
        oraclePriceLoading: oraclePrice.isLoading,
        overallLoading: isLoading,
      },
      CACHE_INFO: {
        hasMarketParams: !!marketParams,
        hasMarketData: !!marketData,
        paramsUpdatedAt: paramsUpdatedAt ? new Date(paramsUpdatedAt).toLocaleTimeString() : 'never',
        marketUpdatedAt: marketUpdatedAt ? new Date(marketUpdatedAt).toLocaleTimeString() : 'never',
        timeSinceParamsUpdate: paramsUpdatedAt ? Date.now() - paramsUpdatedAt : null,
        timeSinceMarketUpdate: marketUpdatedAt ? Date.now() - marketUpdatedAt : null,
      },
      KPI_VALUES: {
        lltv: lltvPercentage,
        totalSupply,
        totalBorrow,
        utilizationRate: `${utilizationRate.toFixed(2)}%`,
        oraclePrice: oraclePrice.value,
        oracleHaircut: oraclePrice.haircutPercentage,
      }
    })
  }

  // Liquidation Threshold: In Morpho Blue, liquidation happens at LLTV (same as max LTV)
  // There is no separate warning threshold - liquidation occurs exactly at LLTV
  const liquidationThreshold = lltv
  const liquidationThresholdPercentage = lltvPercentage

  // Liquidation Bonus: In Morpho Blue, derived from LLTV as (1/LLTV - 1)
  // For 86% LLTV: 1/0.86 - 1 ≈ 0.163 = 16.3% bonus
  const liquidationBonus = lltv && lltv > 0 ? (1 / lltv) - 1 : null
  const liquidationBonusPercentage = liquidationBonus !== null
    ? `${(liquidationBonus * 100).toFixed(0)}%`
    : null

  // Calculate available liquidity
  const availableLiquidity = totalSupply && totalBorrow
    ? (parseFloat(totalSupply) - parseFloat(totalBorrow)).toString()
    : null

  const fee = marketData && marketData.fee > 0n ? Number(formatUnits(marketData.fee, 18)) : 0
  const feePercentage = fee !== null ? `${(fee * 100).toFixed(2)}%` : null

  const lastUpdate = marketData && marketData.lastUpdate > 0n ? Number(marketData.lastUpdate) : null

  const oracleAddress = marketParams?.oracle || contracts.navOracle.address

  // Debug logging (only log once when data changes, not on every render)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && !isLoading && !isError) {
      console.log('🔍 useSystemParams:', {
        marketId,
        lltv,
        lltvPercentage,
        liquidationThreshold,
        liquidationThresholdPercentage,
        liquidationBonus,
        liquidationBonusPercentage,
        totalSupply,
        totalBorrow,
        utilizationRate,
        fee,
        feePercentage,
        oraclePrice: oraclePrice.value,
        oracleAddress,
        lastUpdate: lastUpdate ? new Date(lastUpdate * 1000).toISOString() : null,
      })
    }
  }, [marketId, lltv, lltvPercentage, liquidationThreshold, liquidationThresholdPercentage, liquidationBonus, liquidationBonusPercentage, totalSupply, totalBorrow, utilizationRate, fee, feePercentage, oraclePrice.value, oracleAddress, lastUpdate, isLoading, isError])

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
    oraclePrice: oraclePrice.value,
    oracleAddress,
    oracleHaircutPercentage: oraclePrice.haircutPercentage,
    oracleIsStale: oraclePrice.isStale,
    lastUpdate,
    isLoading,
    isError,
  }
}

