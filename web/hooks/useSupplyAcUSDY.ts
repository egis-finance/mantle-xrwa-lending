/**
 * Supply AcUSDY collateral to Morpho Blue
 *
 * Two-step flow:
 * 1. approve() - grant Morpho spending rights for AcUSDY
 * 2. supplyCollateral() - deposit AcUSDY into Morpho position
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

export type SupplyCollateralStatus = 'idle' | 'approving' | 'supplying' | 'confirming' | 'success' | 'error';

export interface UseSupplyAcUSDYResult {
  supplyCollateral: (amount: bigint) => Promise<Hash>;
  status: SupplyCollateralStatus;
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

function getStatusMessage(status: SupplyCollateralStatus): string {
  switch (status) {
    case 'approving':
      return 'Approving AcUSDY...';
    case 'supplying':
      return 'Supplying collateral to Morpho...';
    case 'confirming':
      return 'Confirming transaction...';
    case 'success':
      return 'Collateral supplied!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
}

/**
 * Hook for supplying AcUSDY collateral to Morpho Blue.
 * Accepts canonical marketParams from on-chain to ensure correct market targeting.
 */
export function useSupplyAcUSDY(
  marketParams: MorphoMarketParams | undefined
): UseSupplyAcUSDYResult {
  const { primaryWallet } = useDynamicContext();
  const [status, setStatus] = useState<SupplyCollateralStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  const supplyCollateral = useCallback(
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

      // Guardrail 2b: AcUSDY contract configured
      if (contracts.acUSDY.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('AcUSDY contract not configured');
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

        // Step 1: Approve AcUSDY to Morpho
        setStatus('approving');
        const approveHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.acUSDY.address,
          abi: ERC20ApproveAbi,
          functionName: 'approve',
          args: [contracts.morpho.address as Address, amount],
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2: Supply collateral to Morpho
        setStatus('supplying');
        const supplyHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.morpho.address,
          abi: MorphoAbi,
          functionName: 'supplyCollateral',
          args: [
            marketParams,  // canonical market params from on-chain
            amount,        // assets (AcUSDY amount, 18 decimals)
            userAddress,   // onBehalf (credit position to user)
            '0x',          // data (empty callback - viem requires hex for bytes)
          ],
        });

        setTxHash(supplyHash);
        setStatus('confirming');

        await publicClient.waitForTransactionReceipt({ hash: supplyHash });

        // Cache invalidation - batch first (always), then user
        invalidateBatchReads(contracts.morpho.chainId);
        await invalidateUserReads(userAddress);

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
    supplyCollateral,
    status,
    statusMessage: getStatusMessage(status),
    error,
    txHash,
    reset,
  };
}
