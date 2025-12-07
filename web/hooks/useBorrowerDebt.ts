'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { getMarketId } from '@/lib/marketId'
import { MorphoAbi } from '@/lib/contracts/abis/Morpho'

export function useBorrowerDebt(borrowerAddress?: `0x${string}`) {
  const marketId = getMarketId()
  const isConfigured = contracts.morpho.address !== '0x0'
  const shouldQuery = Boolean(borrowerAddress) && marketId !== '0x0' && isConfigured

  // Get user position
  const { data: positionData, isLoading: positionLoading, isError: positionError, refetch: refetchPosition } = useReadContract({
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'position',
    args: [marketId, borrowerAddress!],
    chainId: contracts.morpho.chainId,
    query: {
      enabled: shouldQuery,
      refetchInterval: 10000,
    },
  })

  // Get market data
  const { data: marketData, isLoading: marketLoading, isError: marketError, refetch: refetchMarket } = useReadContract({
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'market',
    args: [marketId],
    chainId: contracts.morpho.chainId,
    query: {
      enabled: shouldQuery,
      refetchInterval: 10000,
    },
  })

  // Calculate actual debt from shares
  const debtValue = (() => {
    if (!positionData || !marketData) return null
    
    const position = positionData as { borrowShares: bigint }
    const market = marketData as { totalBorrowAssets: bigint; totalBorrowShares: bigint }

    // If user has no borrow shares, debt is 0
    if (position.borrowShares === 0n) return '0'
    
    // If no total shares (shouldn't happen), return 0
    if (market.totalBorrowShares === 0n) return '0'

    // Calculate: (borrowShares * totalBorrowAssets) / totalBorrowShares
    // USDC has 6 decimals
    const debtAmount = (position.borrowShares * market.totalBorrowAssets) / market.totalBorrowShares
    return formatUnits(debtAmount, 6)
  })()

  const isLoading = positionLoading || marketLoading
  const isError = positionError || marketError

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('🔍 useBorrowerDebt:', {
      borrowerAddress,
      marketId,
      positionData,
      marketData,
      debtValue,
      isLoading,
      isError,
    })
  }

  return {
    value: debtValue,
    borrowShares: positionData ? (positionData as { borrowShares: bigint }).borrowShares : 0n,
    totalBorrowAssets: marketData ? (marketData as { totalBorrowAssets: bigint }).totalBorrowAssets : 0n,
    totalBorrowShares: marketData ? (marketData as { totalBorrowShares: bigint }).totalBorrowShares : 0n,
    isLoading,
    isError,
    refetch: () => {
      refetchPosition()
      refetchMarket()
    },
  }
}

