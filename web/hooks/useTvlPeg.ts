'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker'
import { AcUSDYAbi } from '@/lib/contracts/abis/AcUSDY'

export function useTvlPeg() {
  // Check if contracts are configured
  const isConfigured = contracts.collateralLocker.address !== '0x0' && contracts.acUSDY.address !== '0x0'

  const mantleTvl = useReadContract({
    address: contracts.collateralLocker.address,
    abi: CollateralLockerAbi,
    functionName: 'getTotalLocked',
    chainId: contracts.collateralLocker.chainId,
    query: {
      enabled: isConfigured,
      staleTime: 60000, // Consider stale after 1 minute
      refetchInterval: 60000, // Poll every minute
      refetchOnWindowFocus: true,
    },
  })

  const ethTvl = useReadContract({
    address: contracts.acUSDY.address,
    abi: AcUSDYAbi,
    functionName: 'totalSupply',
    chainId: contracts.acUSDY.chainId,
    query: {
      enabled: isConfigured,
      staleTime: 60000,
      refetchInterval: 60000,
      refetchOnWindowFocus: true,
    },
  })

  const isLoading = mantleTvl.isLoading || ethTvl.isLoading
  const isError = mantleTvl.isError || ethTvl.isError

  if (mantleTvl.isError) {
    console.error('Mantle TVL Error:', mantleTvl.error)
  }
  if (ethTvl.isError) {
    console.error('ETH TVL Error:', ethTvl.error)
  }

  // Both USDY and AcUSDY use 18 decimals
  // Use !== undefined to handle BigInt(0) correctly
  const mantleValue = mantleTvl.data !== undefined ? formatUnits(mantleTvl.data, 18) : null
  const ethValue = ethTvl.data !== undefined ? formatUnits(ethTvl.data, 18) : null

  // Determine balance status with 0.01% tolerance for rounding differences
  const isBalanced = (() => {
    if (mantleValue === null || ethValue === null) return null
    const mantleNum = Number(mantleValue)
    const ethNum = Number(ethValue)
    if (mantleNum === 0 && ethNum === 0) return true
    if (mantleNum === 0) return false
    return Math.abs(mantleNum - ethNum) / mantleNum < 0.0001
  })()

  const isRefetching = mantleTvl.isRefetching || ethTvl.isRefetching

  const refetch = () => {
    mantleTvl.refetch()
    ethTvl.refetch()
  }

  return {
    mantle: { value: mantleValue, ...mantleTvl },
    ethereum: { value: ethValue, ...ethTvl },
    isLoading,
    isError,
    isBalanced,
    isRefetching,
    refetch,
  }
}
