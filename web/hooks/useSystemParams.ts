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
  const { data: marketParams, isLoading: paramsLoading, isError: paramsError } = useReadContract({
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'idToMarketParams',
    args: [marketId],
    chainId: contracts.morpho.chainId,
    query: {
      enabled: isConfigured,
      refetchInterval: false, // Static data - no refetch needed
      refetchOnWindowFocus: false, // Don't refetch when tab regains focus
      refetchOnReconnect: false, // Don't refetch on reconnect
      staleTime: Infinity, // Never consider stale
    },
  })

  // Fetch market data (supply, borrow, fee, lastUpdate) - Can change, but infrequently
  const { data: marketData, isLoading: marketLoading, isError: marketError } = useReadContract({
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'market',
    args: [marketId],
    chainId: contracts.morpho.chainId,
    query: {
      enabled: isConfigured,
      refetchInterval: false, // Disable auto-refetch - these are static system params
      refetchOnWindowFocus: false, // Don't refetch when tab regains focus
      refetchOnReconnect: false, // Don't refetch on reconnect
      staleTime: Infinity, // Never consider stale
    },
  })

  const isLoading = paramsLoading || marketLoading || oraclePrice.isLoading
  const isError = paramsError || marketError || oraclePrice.isError

  // Parse and calculate values
  const lltv = marketParams && marketParams.lltv > 0n
    ? Number(formatUnits(marketParams.lltv, 18))
    : 0.86 // Default to 86% (matches deployment configuration)
  const lltvPercentage = lltv !== null ? `${(lltv * 100).toFixed(0)}%` : null

  // Liquidation Threshold: In Morpho Blue, liquidation happens at LLTV (same as max LTV)
  // There is no separate warning threshold - liquidation occurs exactly at LLTV
  const liquidationThreshold = lltv
  const liquidationThresholdPercentage = lltvPercentage

  // Liquidation Bonus: Typically 5-15% for liquidators. Default to 15% if not available
  // Note: This might need to come from a different source or be protocol-specific
  const liquidationBonus = 0.15 // 15% default - could be fetched from protocol config if available
  const liquidationBonusPercentage = `${(liquidationBonus * 100).toFixed(0)}%`

  const totalSupply = marketData ? formatUnits(marketData.totalSupplyAssets, 6) : null // USDC has 6 decimals
  const totalBorrow = marketData ? formatUnits(marketData.totalBorrowAssets, 6) : null

  // Calculate available liquidity
  const availableLiquidity = totalSupply && totalBorrow
    ? (parseFloat(totalSupply) - parseFloat(totalBorrow)).toString()
    : null

  const utilizationRate = totalSupply && totalBorrow && parseFloat(totalSupply) > 0
    ? (parseFloat(totalBorrow) / parseFloat(totalSupply)) * 100
    : 0 // Default to 0 if no supply

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

