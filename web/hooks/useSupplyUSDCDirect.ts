/**
 * USDC Supply to Morpho Blue - Direct Integration
 *
 * Two-step supply flow calling Morpho directly (no adapter):
 * 1. approve() - grant Morpho spending rights
 * 2. supply() - call Morpho.supply() directly
 *
 * Eliminates adapter abstraction for simpler, more reliable integration.
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
import { writeContractWithTimeout } from '@/lib/errors';
import type { MorphoMarketParams } from './useSystemParams';

export type SupplyStatus = 'idle' | 'approving' | 'supplying' | 'confirming' | 'success' | 'error';

export interface UseSupplyUSDCDirectResult {
  supply: (amount: bigint) => Promise<Hash>;
  status: SupplyStatus;
  statusMessage: string;
  error: Error | null;
  txHash: Hash | null;
  reset: () => void;
}

// Minimal ABI for ERC20 approve
const ERC20ApproveAbi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

function getStatusMessage(status: SupplyStatus): string {
  switch (status) {
    case 'approving':
      return 'Approving USDC...';
    case 'supplying':
      return 'Supplying to Morpho...';
    case 'confirming':
      return 'Confirming transaction...';
    case 'success':
      return 'Supply complete!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
}

/**
 * Hook for supplying USDC directly to Morpho Blue.
 * Accepts canonical marketParams from on-chain to ensure correct market targeting.
 */
export function useSupplyUSDCDirect(
  marketParams: MorphoMarketParams | undefined
): UseSupplyUSDCDirectResult {
  const { primaryWallet } = useDynamicContext();
  const [status, setStatus] = useState<SupplyStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  const supply = useCallback(
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

      if (contracts.usdc.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('USDC contract not configured');
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

      // Validate amount is positive (UI enforces but hook defends itself)
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

        // Step 1: Approve USDC to Morpho directly
        setStatus('approving');
        const approveHash = await writeContractWithTimeout(
          () =>
            walletClient.writeContract({
              account: userAddress,
              address: contracts.usdc.address,
              abi: ERC20ApproveAbi,
              functionName: 'approve',
              args: [contracts.morpho.address as Address, amount],
            }),
          'USDC approval'
        );

        // Wait for approve confirmation
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2: Call Morpho.supply() directly
        setStatus('supplying');
        const supplyHash = await writeContractWithTimeout(
          () =>
            walletClient.writeContract({
              account: userAddress,
              address: contracts.morpho.address,
              abi: MorphoAbi,
              functionName: 'supply',
              args: [
                marketParams, // canonical market params from on-chain
                amount, // assets (exact USDC amount)
                0n, // shares (0 = use assets)
                userAddress, // onBehalf (credit position to user)
                '0x', // data (empty callback)
              ],
            }),
          'Supply signing'
        );

        setTxHash(supplyHash);
        setStatus('confirming');

        // Wait for supply confirmation
        await publicClient.waitForTransactionReceipt({ hash: supplyHash });

        // Invalidate relevant caches
        await invalidateUserReads(userAddress);
        invalidateBatchReads(ETHEREUM_CHAIN_ID);

        setStatus('success');
        return supplyHash;
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
    supply,
    status,
    statusMessage: getStatusMessage(status),
    error,
    txHash,
    reset,
  };
}
