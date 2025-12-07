'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, cookieToInitialState } from 'wagmi'
import { createAppKit } from '@reown/appkit/react'
import { wagmiAdapter, projectId, networks } from '@/lib/config'
import SafeProvider from '@safe-global/safe-apps-react-sdk'


const metadata = {
    name: 'Egis Finance',
    description: 'Cross-chain lending protocol enabling USDY collateral for DeFi',
    // In development we should match the current origin (e.g. http://localhost:3000)
    // WalletConnect warns or may misbehave if this does not match the page URL.
    url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    icons: ['https://egis.finance/icon.png']
}

// Type assertion needed due to version mismatch between @reown/appkit and @reown/appkit-adapter-wagmi
// Both packages pull different versions of @reown/appkit-common, causing type incompatibility
// The adapter and networks work correctly at runtime despite the type error
createAppKit({
    // @ts-expect-error - WagmiAdapter type incompatibility with ChainAdapter (TON namespace mismatch)
    adapters: [wagmiAdapter],
    projectId,
    // @ts-expect-error - Custom VTE chains not recognized as AppKitNetwork but work at runtime
    networks: networks,
    metadata,
    features: {
        analytics: true,
    },
    themeMode: 'light',
    themeVariables: {
        '--w3m-accent': '#627eea',
        '--w3m-border-radius-master': '8px',
    }
})

export function Providers({
    children,
    cookies
}: {
    children: React.ReactNode
    cookies?: string | null
}) {
    const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig, cookies)

    // Create QueryClient with proper caching configuration
    // Use useState to ensure it's created once per app lifecycle
    const [queryClient] = React.useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: Infinity, // Data never goes stale by default
                gcTime: Infinity, // Keep in cache forever
                refetchOnMount: false, // Don't refetch on component mount
                refetchOnWindowFocus: false, // Don't refetch when window regains focus
                refetchOnReconnect: false, // Don't refetch on reconnect
            },
        },
    }))

    return (
        <WagmiProvider config={wagmiAdapter.wagmiConfig} initialState={initialState}>
            <QueryClientProvider client={queryClient}>
                <SafeProvider>
                    {children}
                </SafeProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}
