import { http } from 'wagmi'
import { mainnet, mantle } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

if (typeof window === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { indexedDB } = require('fake-indexeddb');
    global.indexedDB = indexedDB;
}

export const config = getDefaultConfig({
    appName: 'Egis Finance',
    projectId: 'YOUR_PROJECT_ID', // Placeholder
    chains: [mainnet, mantle],
    transports: {
        [mainnet.id]: http(),
        [mantle.id]: http(),
    },
    ssr: true,
})
