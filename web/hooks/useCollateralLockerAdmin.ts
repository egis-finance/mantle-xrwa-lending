'use client';

/**
 * Hook to read the admin address from CollateralLocker and compare to connected wallet.
 * Used to gate admin-only UI actions like unlocking collateral.
 */

import type { Address } from 'viem';
import { isAddressEqual } from 'viem';
import { useMultiChainRead } from '@/lib/swr/useMultiChainRead';
import { contracts, MANTLE_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';
import { useDynamicWallet } from './useDynamicWallet';

export interface UseCollateralLockerAdminResult {
  adminAddress: Address | undefined;
  isAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function useCollateralLockerAdmin(): UseCollateralLockerAdminResult {
  const { address: walletAddress, isConnected } = useDynamicWallet();

  const isConfigured = contracts.collateralLocker.address !== UNCONFIGURED_ADDRESS;

  const { data: adminAddress, isLoading, isError } = useMultiChainRead<
    typeof CollateralLockerAbi,
    'admin',
    Address
  >({
    chainId: MANTLE_CHAIN_ID,
    address: contracts.collateralLocker.address,
    abi: CollateralLockerAbi,
    functionName: 'admin',
    enabled: isConfigured,
  });

  // isAddressEqual from viem handles case-insensitive comparison correctly
  const isAdmin = !!(
    isConnected &&
    walletAddress &&
    adminAddress &&
    isAddressEqual(walletAddress, adminAddress)
  );

  return {
    adminAddress,
    isAdmin,
    isLoading,
    isError,
  };
}
