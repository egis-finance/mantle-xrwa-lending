/**
 * Ethereum-side collateral: AcUSDY deposited in Morpho lending position.
 *
 * Part of the dual collateral pattern:
 * - useLockedUSDY: Source collateral on Mantle (locked USDY)
 * - useMorphoCollateral (this hook): Execution collateral on Ethereum
 *
 * AcUSDY is the attested collateral receipt - non-transferable ERC20 minted
 * after DVN attestation of locked USDY on Mantle. Once minted, users supply
 * AcUSDY to Morpho Blue as collateral for USDC borrowing.
 *
 * Returns the full Morpho position struct (supplyShares, borrowShares, collateral)
 * plus formatted/raw collateral values for convenience.
 *
 * See ARCHITECTURE.md for collateral flow design.
 */

'use client';

import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { useMultiChainRead } from '@/lib/swr/useMultiChainRead';
import { RefreshIntervals } from '@/lib/swr/config';
import type { ReadResult } from '@/lib/swr/utils';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { getMarketId } from '@/lib/marketId';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';

// Morpho position struct returned from position() call
interface MorphoPosition {
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

interface MorphoCollateralResult {
  value: string | null;
  raw: bigint | undefined;
  position: MorphoPosition | undefined;
}
export function useMorphoCollateral(
  borrowerAddress: Address | undefined
): ReadResult<MorphoCollateralResult> {
  const marketId = getMarketId();
  const isConfigured = contracts.morpho.address !== UNCONFIGURED_ADDRESS;
  const enabled = Boolean(borrowerAddress) && marketId !== UNCONFIGURED_ADDRESS && isConfigured;

  const result = useMultiChainRead<typeof MorphoAbi, 'position', MorphoPosition>({
    chainId: contracts.morpho.chainId,
    address: contracts.morpho.address,
    abi: MorphoAbi,
    functionName: 'position',
    args: [marketId as `0x${string}`, borrowerAddress!],
    enabled,
    refreshInterval: RefreshIntervals.USER_POSITION,
  });

  // Extract collateral from position data
  const transformedData: MorphoCollateralResult | undefined = result.data !== undefined
    ? {
        value: result.data.collateral !== undefined
          ? formatUnits(result.data.collateral, 18)
          : null,
        raw: result.data.collateral,
        position: result.data,
      }
    : undefined;

  return {
    ...result,
    data: transformedData,
  };
}
