import { createPublicClient, http, type PublicClient, type Address } from 'viem';
import { getChainById } from '@/lib/dynamic/chains';

// Cache for PublicClient instances (one per chain)
const clientCache = new Map<number, PublicClient>();

// Multicall3 address (same on most EVM chains including mainnet forks)
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
      // VTE chains need explicit multicall3 address
      contracts: {
        multicall3: { address: MULTICALL3_ADDRESS },
      },
    },
    transport: http(rpcUrl),
    batch: { multicall: { batchSize: 100, wait: 10 } },
  });

  clientCache.set(chainId, client);
  return client;
}
