'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { OracleAbi } from '@/lib/contracts/abis/Oracle'

export function useOraclePrice() {
  const isConfigured = contracts.navOracle.address !== '0x0'

  const { data, isLoading, isError, refetch } = useReadContract({
    address: contracts.navOracle.address,
    abi: OracleAbi,
    functionName: 'price',
    chainId: contracts.navOracle.chainId,
    query: {
      enabled: isConfigured,
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  })

  // Format price (Oracle returns price with 18 decimals)
  const priceValue = data !== undefined ? formatUnits(data, 18) : null

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('🔍 useOraclePrice:', {
      oracleAddress: contracts.navOracle.address,
      priceData: data,
      priceValue,
      isLoading,
      isError,
    })
  }

  return {
    value: priceValue,
    data,
    isLoading,
    isError,
    refetch,
  }
}

