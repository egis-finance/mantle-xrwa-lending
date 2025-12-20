'use client';

import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useMultiChainRead, type ReadResult, RefreshIntervals } from '@/lib/swr';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';

// Standard ERC20 ABI for balance and decimals
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

interface BorrowerBalanceResult {
  value: string | null;
  raw: bigint | undefined;
}

/**
 * Reads borrower's USDY balance on Mantle.
 */
export function useBorrowerBalance(
  borrowerAddress: Address | undefined
): ReadResult<BorrowerBalanceResult> {
  const isConfigured = contracts.usdy.address !== UNCONFIGURED_ADDRESS;
  const enabled = Boolean(borrowerAddress) && isConfigured;

  const result = useMultiChainRead<typeof ERC20_BALANCE_ABI, 'balanceOf', bigint>({
    chainId: contracts.usdy.chainId,
    address: contracts.usdy.address,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [borrowerAddress!],
    enabled,
    refreshInterval: RefreshIntervals.USER_POSITION,
  });

  // Transform raw bigint to formatted value (USDY has 18 decimals)
  const transformedData: BorrowerBalanceResult | undefined = result.data !== undefined
    ? {
        value: formatUnits(result.data, 18),
        raw: result.data,
      }
    : undefined;

  return {
    ...result,
    data: transformedData,
  };
}
