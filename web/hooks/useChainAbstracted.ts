/**
 * Cross-chain operation abstraction with silent chain switching.
 *
 * Separates read and write operations:
 *
 * Read operations (no wallet required):
 * - readFromMantle(), readFromEthereum(): Use public clients, always available
 *
 * Write operations (require connected wallet):
 * - signOnMantle(): Lock collateral, emit commitments
 * - executeOnEthereum(): Mint AcUSDY, supply to Morpho, borrow USDC
 *
 * Chain switching behavior: Before each write, the hook checks the wallet's
 * current network via getNetwork() and switches if necessary. Network comparison
 * normalizes string chain IDs to numbers (getNetwork returns string|number).
 *
 * The wallet client's connected chain is used for writes (no explicit chain
 * param to writeContract) - viem infers from the wallet client state.
 *
 * See ARCHITECTURE.md for cross-chain flow design.
 */

'use client';

import { useCallback } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { Address, Abi, Hash, TransactionReceipt } from 'viem';
import { getPublicClient } from '@/lib/swr/chains';
import { MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID, normalizeChainId } from '@/lib/dynamic/chains';
import { writeContractWithTimeout } from '@/lib/errors';

interface ReadContractParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

interface WriteContractParams extends ReadContractParams {
  value?: bigint;
}

interface ChainAbstractedOperations {
  // Read operations (no wallet required, use public client)
  readFromMantle: <T>(params: ReadContractParams) => Promise<T>;
  readFromEthereum: <T>(params: ReadContractParams) => Promise<T>;

  // Write operations (require connected wallet)
  signOnMantle: (params: WriteContractParams) => Promise<Hash>;
  executeOnEthereum: (params: WriteContractParams) => Promise<Hash>;

  // Transaction confirmation
  waitForTransaction: (chainId: number, hash: Hash) => Promise<TransactionReceipt>;

  // Wallet utilities
  getSignerAddress: () => Promise<Address>;

  // State
  canSign: boolean;
}

/**
 * Provides chain-abstracted operations that silently route to the correct chain.
 * Read operations use public clients (no wallet needed).
 * Write operations require a connected wallet and handle chain switching automatically.
 */
export function useChainAbstracted(): ChainAbstractedOperations {
  const { primaryWallet } = useDynamicContext();

  const canSign = !!primaryWallet && isEthereumWallet(primaryWallet);

  const readFromMantle = useCallback(async <T>(params: ReadContractParams): Promise<T> => {
    const client = getPublicClient(MANTLE_CHAIN_ID);
    return client.readContract({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
    }) as Promise<T>;
  }, []);

  const readFromEthereum = useCallback(async <T>(params: ReadContractParams): Promise<T> => {
    const client = getPublicClient(ETHEREUM_CHAIN_ID);
    return client.readContract({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
    }) as Promise<T>;
  }, []);

  const signOnMantle = useCallback(
    async (params: WriteContractParams): Promise<Hash> => {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        throw new Error('No Ethereum wallet connected');
      }

      // Ensure wallet is on Mantle
      const currentNetwork = await primaryWallet.getNetwork();
      if (normalizeChainId(currentNetwork) !== MANTLE_CHAIN_ID) {
        await primaryWallet.switchNetwork(MANTLE_CHAIN_ID);
      }

      const walletClient = await primaryWallet.getWalletClient();
      const [account] = await walletClient.getAddresses();

      return writeContractWithTimeout(
        () =>
          walletClient.writeContract({
            account,
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            args: params.args ?? [],
            value: params.value,
          }),
        `Mantle ${params.functionName}`
      );
    },
    [primaryWallet]
  );

  const executeOnEthereum = useCallback(
    async (params: WriteContractParams): Promise<Hash> => {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        throw new Error('No Ethereum wallet connected');
      }

      // Ensure wallet is on Ethereum
      const currentNetwork = await primaryWallet.getNetwork();
      if (normalizeChainId(currentNetwork) !== ETHEREUM_CHAIN_ID) {
        await primaryWallet.switchNetwork(ETHEREUM_CHAIN_ID);
      }

      const walletClient = await primaryWallet.getWalletClient();
      const [account] = await walletClient.getAddresses();

      return writeContractWithTimeout(
        () =>
          walletClient.writeContract({
            account,
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            args: params.args ?? [],
            value: params.value,
          }),
        `Ethereum ${params.functionName}`
      );
    },
    [primaryWallet]
  );

  const waitForTransaction = useCallback(
    async (chainId: number, hash: Hash): Promise<TransactionReceipt> => {
      const client = getPublicClient(chainId);
      return client.waitForTransactionReceipt({ hash });
    },
    []
  );

  const getSignerAddress = useCallback(async (): Promise<Address> => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      throw new Error('No Ethereum wallet connected');
    }
    const walletClient = await primaryWallet.getWalletClient();
    const [account] = await walletClient.getAddresses();
    return account;
  }, [primaryWallet]);

  return {
    readFromMantle,
    readFromEthereum,
    signOnMantle,
    executeOnEthereum,
    waitForTransaction,
    getSignerAddress,
    canSign,
  };
}
