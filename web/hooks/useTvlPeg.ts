'use client';

import { formatUnits } from 'viem';
import { useCrossChainRead, RefreshIntervals } from '@/lib/swr';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';
import { AcUSDYAbi } from '@/lib/contracts/abis/AcUSDY';

interface TvlPegResult {
  mantle: {
    value: string | null;
    raw: bigint | undefined;
  };
  ethereum: {
    value: string | null;
    raw: bigint | undefined;
  };
  isBalanced: boolean | null;
}

/**
 * Reads TVL peg between Mantle (locked USDY) and Ethereum (AcUSDY supply).
 * Uses atomic cross-chain read to ensure values are from same polling cycle.
 */
export function useTvlPeg() {
  const isConfigured =
    contracts.collateralLocker.address !== UNCONFIGURED_ADDRESS && contracts.acUSDY.address !== UNCONFIGURED_ADDRESS;

  const result = useCrossChainRead<bigint, bigint>({
    mantleContract: {
      address: contracts.collateralLocker.address,
      abi: CollateralLockerAbi,
      functionName: 'getTotalLocked',
    },
    ethereumContract: {
      address: contracts.acUSDY.address,
      abi: AcUSDYAbi,
      functionName: 'totalSupply',
    },
    enabled: isConfigured,
    refreshInterval: RefreshIntervals.PROTOCOL_TVL,
    revalidateOnFocus: true,
  });

  // Transform raw data to formatted values
  const transformedData: TvlPegResult | undefined = (() => {
    if (!result.data) return undefined;

    const mantleRaw = result.data.mantle;
    const ethereumRaw = result.data.ethereum;

    // Both USDY and AcUSDY use 18 decimals
    const mantleValue = mantleRaw !== undefined ? formatUnits(mantleRaw, 18) : null;
    const ethValue = ethereumRaw !== undefined ? formatUnits(ethereumRaw, 18) : null;

    // Determine balance status with 0.01% tolerance for rounding
    const isBalanced = (() => {
      if (mantleValue === null || ethValue === null) return null;
      const mantleNum = Number(mantleValue);
      const ethNum = Number(ethValue);
      if (mantleNum === 0 && ethNum === 0) return true;
      if (mantleNum === 0) return false;
      return Math.abs(mantleNum - ethNum) / mantleNum < 0.0001;
    })();

    return {
      mantle: { value: mantleValue, raw: mantleRaw },
      ethereum: { value: ethValue, raw: ethereumRaw },
      isBalanced,
    };
  })();

  return {
    ...result,
    data: transformedData,
    // Convenience accessors
    mantle: transformedData?.mantle ?? { value: null, raw: undefined },
    ethereum: transformedData?.ethereum ?? { value: null, raw: undefined },
    isBalanced: transformedData?.isBalanced ?? null,
  };
}
