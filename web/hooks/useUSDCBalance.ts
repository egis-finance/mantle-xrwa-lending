'use client';

import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useMultiChainRead, type ReadResult, RefreshIntervals } from '@/lib/swr';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

interface USDCBalanceResult {
  value: string | null;
  raw: bigint | undefined;
}

/**
 * Reads user's USDC balance on Ethereum.
 * Used by lenders to check available funds for supply.
 */
export function useUSDCBalance(
  userAddress: Address | undefined
): ReadResult<USDCBalanceResult> {
  const isConfigured = contracts.usdc.address !== UNCONFIGURED_ADDRESS;
  const enabled = Boolean(userAddress) && isConfigured;

  const result = useMultiChainRead<typeof ERC20_ABI, 'balanceOf', bigint>({
    chainId: contracts.usdc.chainId,
    address: contracts.usdc.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [userAddress!],
    enabled,
    refreshInterval: RefreshIntervals.USER_POSITION,
  });

  // Transform raw bigint to formatted value (USDC has 6 decimals)
  const transformedData: USDCBalanceResult | undefined = result.data !== undefined
    ? {
        value: formatUnits(result.data, 6),
        raw: result.data,
      }
    : undefined;

  return {
    ...result,
    data: transformedData,
  };
}
