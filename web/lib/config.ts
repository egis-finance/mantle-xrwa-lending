import { cookieStorage, createStorage } from '@wagmi/core'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, mantle } from '@reown/appkit/networks'
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
        default: {
            http: [
                process.env.NEXT_PUBLIC_MANTLE_RPC_VTE ||
                'https://virtual.mantle.eu.rpc.tenderly.co/2646db6c-77aa-4a11-97ac-79a7fe731bf4'
            ]
        },
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

export const projectId = '38ab5a2e51b9757e06fe37a5261e800a'

if (!projectId) {
    throw new Error('Project ID is not defined')
}

export const networks = [mainnet, mantle, mantleVTE, ethereumVTE]

export const wagmiAdapter = new WagmiAdapter({
    storage: createStorage({
        storage: cookieStorage
    }),
    ssr: true,
    projectId,
    networks
})

export const config = wagmiAdapter.wagmiConfig
