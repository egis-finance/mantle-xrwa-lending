import { http, createConfig } from 'wagmi'
import { mainnet, mantle } from 'wagmi/chains'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
    rainbowWallet,
    metaMaskWallet,
    safeWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { safe } from 'wagmi/connectors'
import { type Chain } from 'viem'

if (typeof window === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { indexedDB } = require('fake-indexeddb');
    global.indexedDB = indexedDB;
}

const mantleVTE = {
    id: 15000,
    name: 'Mantle VTE',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://virtual.mantle.eu.rpc.tenderly.co/2646db6c-77aa-4a11-97ac-79a7fe731bf4'] },
    },
} as const satisfies Chain

const ethereumVTE = {
    id: 10001,
    name: 'Ethereum VTE',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://virtual.mainnet.eu.rpc.tenderly.co/099a70af-6185-4e28-b190-7e65e144ec95'] },
    },
} as const satisfies Chain

const connectors = connectorsForWallets(
    [
        {
            groupName: 'Recommended',
            wallets: [
                safeWallet,
                rainbowWallet,
                metaMaskWallet,
            ],
        },
    ],
    {
        appName: 'Egis Finance',
        projectId: '38ab5a2e51b9757e06fe37a5261e800a',
    }
)

export const config = createConfig({
    chains: [mainnet, mantle, mantleVTE, ethereumVTE],
    connectors: [
        // Safe connector for iframe support (auto-detects Safe App)
        safe({
            debug: false,
            shimDisconnect: true,
        }),
        ...connectors,
    ],
    transports: {
        [mainnet.id]: http(),
        [mantle.id]: http(),
        [mantleVTE.id]: http(),
        [ethereumVTE.id]: http(),
    },
    ssr: true,
})
