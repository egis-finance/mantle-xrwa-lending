'use client'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { ETHEREUM_VTE_CHAIN_ID } from '@/lib/contracts'

// Standard ERC20 ABI for balance and decimals
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

export function useLenderBalance(lenderAddress?: `0x${string}`) {
  const usdcAddress = (process.env.NEXT_PUBLIC_ETH_USDC ?? '0x0') as `0x${string}`
  const isConfigured = usdcAddress !== '0x0'
  const shouldQuery = Boolean(lenderAddress) && isConfigured

  const { data: balance, isLoading: isBalanceLoading, isError: isBalanceError, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [lenderAddress!],
    chainId: ETHEREUM_VTE_CHAIN_ID,
    query: {
      enabled: shouldQuery,
      refetchInterval: 10000,
    },
  })

  const { data: decimals, isLoading: isDecimalsLoading } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId: ETHEREUM_VTE_CHAIN_ID,
    query: {
      enabled: isConfigured,
      staleTime: Infinity,
    },
  })

  // Format balance using dynamic decimals (default to 6 for USDC if fetch fails but generally should wait)
  // If decimals are loading, we might show null or wait. 
  // If decimals failed, fallback to 6 (standard USDC).
  const resolvedDecimals = decimals ?? 6
  const balanceValue = balance !== undefined ? formatUnits(balance, resolvedDecimals) : null
  
  const isLoading = isBalanceLoading || isDecimalsLoading
  const isError = isBalanceError

  return {
    value: balanceValue,
    data: balance,
    isLoading,
    isError,
    refetch: refetchBalance,
  }
}


