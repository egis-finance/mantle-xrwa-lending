'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { MANTLE_VTE_CHAIN_ID } from '@/lib/contracts'

// Standard ERC20 balanceOf ABI
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

export function useBorrowerBalance(borrowerAddress?: `0x${string}`) {
  const usdyAddress = (process.env.NEXT_PUBLIC_MANTLE_USDY ?? '0x5bE26527e817998A7206475496fDE1E68957c5A6') as `0x${string}`
  const shouldQuery = Boolean(borrowerAddress)

  const { data, isLoading, isError, refetch } = useReadContract({
    address: usdyAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [borrowerAddress!],
    chainId: MANTLE_VTE_CHAIN_ID,
    query: {
      enabled: shouldQuery,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  })

  // Format balance (USDY has 18 decimals)
  const balanceValue = data !== undefined ? formatUnits(data, 18) : null

  return {
    value: balanceValue,
    data,
    isLoading,
    isError,
    refetch,
  }
}

