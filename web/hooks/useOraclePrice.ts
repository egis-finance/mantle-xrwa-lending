'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { OracleAbi } from '@/lib/contracts/abis/Oracle'

export function useOraclePrice() {
  const isConfigured = contracts.navOracle.address !== '0x0'

  // Fetch price with haircut (what Morpho uses)
  const { data: priceData, isLoading: priceLoading, isError: priceError, refetch: refetchPrice } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'price',
    chainId: contracts.navOracle.chainId,
    query: {
      enabled: isConfigured,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  })

  // Fetch haircut percentage
  const { data: haircutBps } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'HAIRCUT_BPS',
    chainId: contracts.navOracle.chainId,
    query: {
      enabled: isConfigured,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  })

  // Fetch staleness status
  const { data: isStale } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'isStale',
    chainId: contracts.navOracle.chainId,
    query: {
      enabled: isConfigured,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  })

  // Format price (Oracle returns price with 24 decimals for Morpho)
  const priceValue = priceData !== undefined ? formatUnits(priceData, 24) : null

  // Calculate haircut percentage (e.g., 200 BPS = 2%)
  const haircutPercentage = haircutBps !== undefined ? Number(haircutBps) / 100 : null

  return {
    value: priceValue,
    haircutPercentage,
    isStale: isStale ?? null,
    data: priceData,
    isLoading: priceLoading,
    isError: priceError,
    refetch: refetchPrice,
  }
}
