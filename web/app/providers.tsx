/**
 * Provider configuration for Dynamic SDK + SWR.
 *
 * Dynamic SDK v4.50+ architecture splits configuration between client code and the Dynamic Dashboard:
 *
 * Client-side (this file):
 * - environmentId: Project identifier from app.dynamic.xyz
 * - walletConnectors: EthereumWalletConnectors for EVM chain support
 * - walletsFilter: Restricts to embedded wallets only (no MetaMask/WalletConnect)
 * - overrides.evmNetworks: Merges env-specific chains, filters to allowed chain IDs
 *
 * Dashboard-side (app.dynamic.xyz > SDK Settings):
 * - embeddedWallets.createOnLogin: Auto-create wallet on first auth
 * - initialAuthenticationMode: connect-only vs full auth flow
 * - Social login providers (email, Google, etc.)
 * - Wallet UI branding and customization
 *
 * CSS injection note: Dynamic SDK v4.50+ uses shadow DOM for styles.
 * No CSS import needed in layout.tsx - differs from earlier versions.
 *
 * See ARCHITECTURE.md for design rationale.
 */

'use client';

import * as React from 'react';
import { DynamicContextProvider, mergeNetworks } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { SWRProvider } from '@/lib/swr';
import { getEnv } from '@/lib/env';
import { supportedNetworks, MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID } from '@/lib/dynamic/chains';

const env = getEnv();

// Allowed chain IDs (only expose env-appropriate chains)
const allowedChainIds = new Set([MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID]);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: env.dynamicEnvId,
        walletConnectors: [EthereumWalletConnectors],

        // STRICT embedded wallet filter - runs synchronously on SDK init.
        // Uses TypeScript-safe guards to filter to embedded wallets only.
        walletsFilter: (wallets) =>
          wallets.filter((w) => {
            const wallet = w as unknown as Record<string, unknown>;
            // Check isEmbeddedWallet flag (primary method)
            if (wallet.isEmbeddedWallet === true) return true;
            // Fallback: exact key match for embedded wallet
            if (typeof wallet.key === 'string' && wallet.key === 'embeddedwallet') return true;
            return false;
          }),

        // mergeNetworks: our supportedNetworks take precedence over dashboard config.
        // Then filter to allowedChainIds - prevents Dynamic showing chains we don't support.
        overrides: {
          evmNetworks: (dashboardNetworks) =>
            mergeNetworks(supportedNetworks, dashboardNetworks).filter((n) =>
              allowedChainIds.has(typeof n.chainId === 'string' ? parseInt(n.chainId, 10) : n.chainId)
            ),
        },
      }}
    >
      <SWRProvider>{children}</SWRProvider>
    </DynamicContextProvider>
  );
}
