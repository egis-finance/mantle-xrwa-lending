'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { getMarketId } from '@/lib/marketId'
import { MorphoAbi } from '@/lib/contracts/abis/Morpho'

export function useBorrowerCollateral(borrowerAddress?: `0x${string}`) {
  const marketId = getMarketId()
  const shouldQuery = Boolean(borrowerAddress) && marketId !== '0x0'

  const { data, isLoading, isError, refetch } = useReadContract({
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'position',
    args: [marketId, borrowerAddress!],
    chainId: contracts.morpho.chainId,
    query: {
      enabled: shouldQuery,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  })

  // Extract collateral from position data
  const collateralValue = data && typeof data === 'object' && 'collateral' in data
    ? formatUnits(data.collateral as bigint, 18)
    : null

  return {
    value: collateralValue,
    data,
    isLoading,
    isError,
    refetch,
  }
}

