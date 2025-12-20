import { createPublicClient, http, type PublicClient, type Address } from 'viem';
import { getChainById } from '@/lib/dynamic/chains';

// Cache for PublicClient instances (one per chain)
const clientCache = new Map<number, PublicClient>();

// Multicall3 uses deterministic CREATE2 deployment - same address on all EVM chains.
// Works on Tenderly VTE forks because they inherit mainnet state including this contract.
const MULTICALL3_ADDRESS: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * Get or create a cached PublicClient for the given chain.
 * Throws on unknown chainId (fail fast).
 */
export function getPublicClient(chainId: number): PublicClient {
  let client = clientCache.get(chainId);
  if (client) return client;

  const chain = getChainById(chainId);

  // Assert RPC URL exists (misconfigured env should fail loudly)
  const rpcUrl = chain.rpcUrls[0];
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL configured for chain ${chainId} (${chain.name}). Check env vars.`
    );
  }

  client = createPublicClient({
    chain: {
      id: chain.chainId,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: { default: { http: chain.rpcUrls } },
      // VTE (Virtual TestNet) uses custom chain IDs (15000/10001) to prevent wallet
      // conflicts with real mainnet. Must explicitly set multicall3 since viem
      // doesn't recognize these as known chains.
      contracts: {
        multicall3: { address: MULTICALL3_ADDRESS },
      },
    },
    transport: http(rpcUrl),
    // Batch up to 100 calls per multicall, wait 10ms to collect calls before sending
    batch: { multicall: { batchSize: 100, wait: 10 } },
  });

  clientCache.set(chainId, client);
  return client;
}
