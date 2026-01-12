/**
 * USDC Withdrawal from Morpho Blue - Direct Integration
 */

'use client';

import { useState, useCallback } from 'react';
import type { Address, Hash } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';
import { invalidateUserReads, invalidateBatchReads } from '@/lib/swr/invalidation';
import { normalizeChainId } from '@/lib/dynamic/chains';
import type { MorphoMarketParams } from './useSystemParams';

export type WithdrawStatus = 'idle' | 'withdrawing' | 'confirming' | 'success' | 'error';

export interface UseWithdrawUSDCDirectResult {
  withdraw: (amount: bigint) => Promise<Hash>;
  status: WithdrawStatus;
  statusMessage: string;
  error: Error | null;
  txHash: Hash | null;
  reset: () => void;
}

function getStatusMessage(status: WithdrawStatus): string {
  switch (status) {
    case 'withdrawing':
      return 'Withdrawing from Morpho...';
    case 'confirming':
      return 'Confirming transaction...';
    case 'success':
      return 'Withdrawal complete!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
}

/**
 * Hook for withdrawing USDC directly from Morpho Blue.
 */
export function useWithdrawUSDCDirect(
  marketParams: MorphoMarketParams | undefined
): UseWithdrawUSDCDirectResult {
  const { primaryWallet } = useDynamicContext();
  const [status, setStatus] = useState<WithdrawStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  const withdraw = useCallback(
    async (amount: bigint): Promise<Hash> => {
      // Validate wallet connection
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        const err = new Error('No Ethereum wallet connected');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Validate contracts configured
      if (contracts.morpho.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('Morpho contract not configured');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Validate market params loaded from on-chain
      if (!marketParams) {
        const err = new Error('Market params not loaded');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Validate amount is positive
      if (amount <= 0n) {
        const err = new Error('Amount must be greater than zero');
        setError(err);
        setStatus('error');
        throw err;
      }

      try {
        reset();

        // Ensure wallet is on Ethereum
        const currentNetwork = await primaryWallet.getNetwork();
        if (normalizeChainId(currentNetwork) !== ETHEREUM_CHAIN_ID) {
          await primaryWallet.switchNetwork(ETHEREUM_CHAIN_ID);
        }

        const walletClient = await primaryWallet.getWalletClient();
        const [userAddress] = await walletClient.getAddresses();
        const publicClient = getPublicClient(ETHEREUM_CHAIN_ID);

        // Step 1: Call Morpho.withdraw() directly
        setStatus('withdrawing');
        const withdrawHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.morpho.address,
          abi: MorphoAbi,
          functionName: 'withdraw',
          args: [
            marketParams,   // canonical market params from on-chain
            amount,         // assets (exact USDC amount)
            0n,             // shares (0 = use assets)
            userAddress,    // onBehalf (withdraw from user's position)
            userAddress,    // receiver (send assets to user)
          ],
        });

        setTxHash(withdrawHash);
        setStatus('confirming');

        // Wait for withdraw confirmation
        await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

        // Invalidate relevant caches
        await invalidateUserReads(userAddress);
        invalidateBatchReads(ETHEREUM_CHAIN_ID);

        setStatus('success');
        return withdrawHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error', { cause: err });
        setError(error);
        setStatus('error');
        throw error;
      }
    },
    [primaryWallet, marketParams, reset]
  );

  return {
    withdraw,
    status,
    statusMessage: getStatusMessage(status),
    error,
    txHash,
    reset,
  };
}

