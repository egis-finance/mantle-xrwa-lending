/**
 * USDC Supply to Morpho via MorphoAdapter
 *
 * Simpler two-step supply flow:
 * 1. Approve USDC to MorphoAdapter
 * 2. Call supplyUSDC() on adapter
 *
 * More reliable than Bundler3 for testing environments.
 */

'use client';

import { useState, useCallback } from 'react';
import type { Address, Hash } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { invalidateUserReads, invalidateBatchReads } from '@/lib/swr/invalidation';
import { normalizeChainId } from '@/lib/dynamic/chains';

export type SupplyStatus = 'idle' | 'approving' | 'supplying' | 'confirming' | 'success' | 'error';

export interface UseSupplyUSDCAdapterResult {
  supply: (amount: bigint) => Promise<Hash>;
  status: SupplyStatus;
  statusMessage: string;
  error: Error | null;
  txHash: Hash | null;
  reset: () => void;
}

// Minimal ABIs for approve and supplyUSDC
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

const MorphoAdapterAbi = [
  {
    name: 'supplyUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
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
 * Hook for supplying USDC to Morpho market via MorphoAdapter.
 * Uses two transactions: approve + supplyUSDC.
 */
export function useSupplyUSDCAdapter(): UseSupplyUSDCAdapterResult {
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
      if (contracts.adapter.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('MorphoAdapter contract not configured');
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

        // Step 1: Approve USDC to MorphoAdapter
        setStatus('approving');
        const approveHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.usdc.address,
          abi: ERC20ApproveAbi,
          functionName: 'approve',
          args: [contracts.adapter.address as Address, amount],
        });

        // Wait for approve confirmation
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2: Call supplyUSDC on MorphoAdapter
        setStatus('supplying');
        const supplyHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.adapter.address,
          abi: MorphoAdapterAbi,
          functionName: 'supplyUSDC',
          args: [amount],
        });

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
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
        throw error;
      }
    },
    [primaryWallet, reset]
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
