/**
 * Withdraw AcUSDY collateral from Morpho Blue
 *
 * Single-step flow (no approval needed - user receives tokens):
 * 1. withdrawCollateral() - call Morpho.withdrawCollateral() to receive AcUSDY
 */

'use client';

import { useState, useCallback } from 'react';
import type { Hash } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';
import { invalidateUserReads, invalidateBatchReads } from '@/lib/swr/invalidation';
import { normalizeChainId } from '@/lib/dynamic/chains';
import type { MorphoMarketParams } from './useSystemParams';

export type WithdrawCollateralStatus = 'idle' | 'withdrawing' | 'confirming' | 'success' | 'error';

export interface UseWithdrawAcUSDYResult {
  withdrawCollateral: (amount: bigint) => Promise<Hash>;
  status: WithdrawCollateralStatus;
  statusMessage: string;
  error: Error | null;
  txHash: Hash | null;
  reset: () => void;
}

function getStatusMessage(status: WithdrawCollateralStatus): string {
  switch (status) {
    case 'withdrawing':
      return 'Withdrawing collateral...';
    case 'confirming':
      return 'Confirming transaction...';
    case 'success':
      return 'Collateral withdrawn!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
}

/**
 * Hook for withdrawing AcUSDY collateral from Morpho Blue.
 * Accepts canonical marketParams from on-chain to ensure correct market targeting.
 *
 * Note: Withdrawing more collateral than health factor allows will revert.
 * UI should validate against remaining capacity.
 */
export function useWithdrawAcUSDY(
  marketParams: MorphoMarketParams | undefined
): UseWithdrawAcUSDYResult {
  const { primaryWallet } = useDynamicContext();
  const [status, setStatus] = useState<WithdrawCollateralStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  const withdrawCollateral = useCallback(
    async (amount: bigint): Promise<Hash> => {
      // Guardrail 1: Wallet connected
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        const err = new Error('No Ethereum wallet connected');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 2: Morpho contract configured
      if (contracts.morpho.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('Morpho contract not configured');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 3: Market params loaded
      if (!marketParams) {
        const err = new Error('Market params not loaded');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 4: Amount positive
      if (amount <= 0n) {
        const err = new Error('Amount must be greater than zero');
        setError(err);
        setStatus('error');
        throw err;
      }

      try {
        reset();

        // Guardrail 5: Derive userAddress once - reuse for calls AND invalidation
        const walletClient = await primaryWallet.getWalletClient();
        const [userAddress] = await walletClient.getAddresses();

        // Guardrail 6: Fail if address missing
        if (!userAddress) {
          const err = new Error('Could not resolve wallet address');
          setError(err);
          setStatus('error');
          throw err;
        }

        // Guardrail 7: Switch chain before first write
        const currentNetwork = await primaryWallet.getNetwork();
        if (normalizeChainId(currentNetwork) !== ETHEREUM_CHAIN_ID) {
          await primaryWallet.switchNetwork(ETHEREUM_CHAIN_ID);
        }

        const publicClient = getPublicClient(ETHEREUM_CHAIN_ID);

        // Withdraw collateral from Morpho (no approval needed - user receives tokens)
        setStatus('withdrawing');
        const withdrawHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.morpho.address,
          abi: MorphoAbi,
          functionName: 'withdrawCollateral',
          args: [
            marketParams,  // canonical market params from on-chain
            amount,        // assets (AcUSDY amount, 18 decimals)
            userAddress,   // onBehalf (withdraw from this user's position)
            userAddress,   // receiver (AcUSDY sent to user)
          ],
        });

        setTxHash(withdrawHash);
        setStatus('confirming');

        await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

        // Cache invalidation - batch first (always), then user
        invalidateBatchReads(contracts.morpho.chainId);
        await invalidateUserReads(userAddress);

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
    withdrawCollateral,
    status,
    statusMessage: getStatusMessage(status),
    error,
    txHash,
    reset,
  };
}
