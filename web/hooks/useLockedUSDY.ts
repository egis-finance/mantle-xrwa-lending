/**
 * Mantle-side collateral: USDY locked in CollateralLocker.
 *
 * Part of the dual collateral pattern:
 * - useLockedUSDY (this hook): Source collateral on Mantle
 * - useMorphoCollateral: Execution collateral on Ethereum (AcUSDY in Morpho)
 *
 * The locked USDY backs AcUSDY issuance on Ethereum. A borrower's locked
 * balance determines maximum AcUSDY that can be minted via DVN attestation.
 *
 * Returns value (formatted string) and raw (bigint) for display flexibility.
 *
 * See ARCHITECTURE.md for collateral flow design.
 */

'use client';

import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useMultiChainRead, type ReadResult, RefreshIntervals } from '@/lib/swr';
import { contracts } from '@/lib/contracts';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';

interface LockedUSDYResult {
  value: string | null;
  raw: bigint | undefined;
}
export function useLockedUSDY(
  borrowerAddress: Address | undefined
): ReadResult<LockedUSDYResult> {
  const isConfigured = contracts.collateralLocker.address !== '0x0';
  const enabled = Boolean(borrowerAddress) && isConfigured;

  const result = useMultiChainRead<typeof CollateralLockerAbi, 'getUserLockedBalance', bigint>({
    chainId: contracts.collateralLocker.chainId,
    address: contracts.collateralLocker.address,
    abi: CollateralLockerAbi,
    functionName: 'getUserLockedBalance',
    args: [borrowerAddress!],
    enabled,
    refreshInterval: RefreshIntervals.USER_POSITION,
  });

  // Transform raw bigint to formatted value
  const transformedData: LockedUSDYResult | undefined = result.data !== undefined
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
