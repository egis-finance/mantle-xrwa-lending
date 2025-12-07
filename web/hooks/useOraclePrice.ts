'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { OracleAbi } from '@/lib/contracts/abis/Oracle'

export function useOraclePrice() {
  const isConfigured = contracts.navOracle.address !== '0x0'

  // Fetch price with haircut (what Morpho uses)
  // Cache indefinitely - oracle configuration doesn't change frequently
  const { data: priceData, isLoading: priceLoading, isError: priceError, refetch: refetchPrice } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'price',
    chainId: contracts.navOracle.chainId,
    query: {
      staleTime: Infinity, // Never consider stale
      gcTime: Infinity, // Keep in cache forever
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  })

  // Fetch haircut percentage (static configuration)
  const { data: haircutBps } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'HAIRCUT_BPS',
    chainId: contracts.navOracle.chainId,
    query: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  })

  // Fetch staleness status (static configuration)
  const { data: isStale } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'isStale',
    chainId: contracts.navOracle.chainId,
    query: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
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
