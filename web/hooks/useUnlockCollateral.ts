'use client';

/**
 * Hook to execute unlock(recipient, amount, lockId) on CollateralLocker.
 *
 * Admin-only operation that releases locked USDY on Mantle after borrower
 * has fully repaid their debt on Ethereum. Follows 7-guardrail pattern:
 * 1. Wallet connected
 * 2. Contract configured
 * 3. Admin check (explicit)
 * 4. Positive amount
 * 5. Valid recipient
 * 6. Chain switch to Mantle
 * 7. Get wallet client/address
 */

import { useState, useCallback } from 'react';
import type { Address, Hash } from 'viem';
import { isAddress, zeroAddress, isHex } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, MANTLE_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';
import { normalizeChainId } from '@/lib/dynamic/chains';

export type UnlockStatus = 'idle' | 'unlocking' | 'confirming' | 'success' | 'error';

// Zero hash represents missing/uninitialized lockId from useReleaseQueue
const ZERO_LOCK_ID = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export interface UseUnlockCollateralResult {
  unlock: (recipient: Address, amount: bigint, lockId: Hash) => Promise<Hash>;
  status: UnlockStatus;
  statusMessage: string;
  error: Error | null;
  txHash: Hash | null;
  reset: () => void;
}

function getStatusMessage(status: UnlockStatus): string {
  switch (status) {
    case 'unlocking':
      return 'Unlocking collateral...';
    case 'confirming':
      return 'Confirming transaction...';
    case 'success':
      return 'Unlock complete!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
}

/**
 * Hook for unlocking collateral from CollateralLocker.
 *
 * @param isAdmin - Whether connected wallet is admin (from useCollateralLockerAdmin)
 * @param onSuccess - Callback fired after successful unlock (e.g., to refresh release queue)
 */
export function useUnlockCollateral(
  isAdmin: boolean,
  onSuccess?: () => Promise<void> | void
): UseUnlockCollateralResult {
  const { primaryWallet } = useDynamicContext();
  const [status, setStatus] = useState<UnlockStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  const unlock = useCallback(
    async (recipient: Address, amount: bigint, lockId: Hash): Promise<Hash> => {
      // Guardrail 1: Wallet connected
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        const err = new Error('No Ethereum wallet connected');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 2: Contract configured
      if (contracts.collateralLocker.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('CollateralLocker contract not configured');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 3: Admin check (fail fast before any tx attempt)
      if (!isAdmin) {
        const err = new Error('Only admin can unlock collateral');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 4: Positive amount
      if (amount <= 0n) {
        const err = new Error('Amount must be greater than zero');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 5: Valid recipient address
      if (!isAddress(recipient) || recipient === zeroAddress) {
        const err = new Error('Invalid recipient address');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Validate lockId: must be bytes32 (0x + 64 hex chars = 66 total)
      // Note: lockId comes from on-chain data via useReleaseQueue, not user input.
      // This validation is defensive against data corruption.
      if (!isHex(lockId) || lockId.length !== 66) {
        const err = new Error('Invalid lockId format: must be bytes32');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Zero hash indicates missing lockId - useReleaseQueue defaults to this
      if (lockId === ZERO_LOCK_ID) {
        const err = new Error('Missing lockId: collateral lock data incomplete');
        setError(err);
        setStatus('error');
        throw err;
      }

      try {
        reset();

        // Guardrail 6: Ensure wallet is on Mantle
        const currentNetwork = await primaryWallet.getNetwork();
        if (normalizeChainId(currentNetwork) !== MANTLE_CHAIN_ID) {
          await primaryWallet.switchNetwork(MANTLE_CHAIN_ID);
        }

        // Guardrail 7: Get wallet client and address
        const walletClient = await primaryWallet.getWalletClient();
        const addresses = await walletClient.getAddresses();
        if (!addresses || addresses.length === 0) {
          throw new Error('No wallet address available');
        }
        const userAddress = addresses[0];
        const publicClient = getPublicClient(MANTLE_CHAIN_ID);

        // Execute unlock transaction
        setStatus('unlocking');
        const hash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.collateralLocker.address,
          abi: CollateralLockerAbi,
          functionName: 'unlock',
          args: [recipient, amount, lockId],
        });

        setTxHash(hash);
        setStatus('confirming');

        // Wait for confirmation and check receipt status
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'reverted') {
          throw new Error('Transaction reverted on-chain');
        }

        // Fire success callback (e.g., to refresh release queue via SWR mutate)
        try {
          await onSuccess?.();
        } catch (refreshError) {
          // Cache refresh failed but tx succeeded - log for debugging only
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Cache refresh failed after unlock:', refreshError);
          }
        }

        setStatus('success');
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error', { cause: err });
        setError(error);
        setStatus('error');
        throw error;
      }
    },
    [primaryWallet, isAdmin, onSuccess, reset]
  );

  return {
    unlock,
    status,
    statusMessage: getStatusMessage(status),
    error,
    txHash,
    reset,
  };
}
