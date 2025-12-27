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

interface AcUSDYBalanceResult {
  value: string | null;
  raw: bigint | undefined;
}

/**
 * Reads borrower's AcUSDY balance in their wallet on Ethereum.
 * This represents collateral that has been minted/attested but not yet supplied to Morpho.
 */
export function useAcUSDYBalance(
  borrowerAddress: Address | undefined
): ReadResult<AcUSDYBalanceResult> {
  const isConfigured = contracts.acUSDY.address !== UNCONFIGURED_ADDRESS;
  const enabled = Boolean(borrowerAddress) && isConfigured;

  const result = useMultiChainRead<typeof ERC20_ABI, 'balanceOf', bigint>({
    chainId: contracts.acUSDY.chainId,
    address: contracts.acUSDY.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [borrowerAddress!],
    enabled,
    refreshInterval: RefreshIntervals.USER_POSITION,
  });

  const transformedData: AcUSDYBalanceResult | undefined = result.data !== undefined
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
