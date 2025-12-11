'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { OracleAbi } from '@/lib/contracts/abis/Oracle'

export function useOraclePrice() {
  const isConfigured = contracts.navOracle.address !== '0x0'

  // Fetch price with haircut (what Morpho uses)
  // NAV can change when underlying asset price updates
  const { data: priceData, isLoading: priceLoading, isError: priceError, refetch: refetchPrice } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'price',
    chainId: contracts.navOracle.chainId,
    query: {
      staleTime: 60000, // Consider stale after 1 minute
      gcTime: Infinity, // Keep in cache
      refetchInterval: 60000, // Poll every minute
      refetchOnWindowFocus: true,
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

  // Fetch staleness status (dynamic check - can change over time)
  const { data: isStale } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'isStale',
    chainId: contracts.navOracle.chainId,
    query: {
      staleTime: 60000,
      gcTime: Infinity,
      refetchInterval: 60000,
      refetchOnWindowFocus: true,
    },
  })

  // Morpho oracle precision: 10^(36 + loanDecimals - collateralDecimals)
  // For USDC (6) / AcUSDY (18): 10^(36 + 6 - 18) = 10^24
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
