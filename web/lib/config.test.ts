// Mock dependencies BEFORE importing config
jest.mock('wagmi', () => ({
    createConfig: jest.fn((config) => config),
    http: jest.fn(),
}));

jest.mock('wagmi/chains', () => ({
    mainnet: { id: 1, name: 'Mainnet' },
    mantle: { id: 5000, name: 'Mantle' },
}));

jest.mock('@rainbow-me/rainbowkit', () => ({
    connectorsForWallets: jest.fn((groups) => {
        // Flatten wallets into a list of connectors for testing
        return groups.flatMap((g: { wallets: unknown[] }) => g.wallets).map((w: () => unknown) => w());
    }),
}));

jest.mock('@rainbow-me/rainbowkit/wallets', () => ({
    rainbowWallet: jest.fn(() => ({ id: 'rainbow', name: 'Rainbow' })),
    metaMaskWallet: jest.fn(() => ({ id: 'metaMask', name: 'MetaMask' })),
    safeWallet: jest.fn(() => ({ id: 'safe', name: 'Safe' })),
}));

jest.mock('wagmi/connectors', () => ({
    safe: jest.fn(() => ({ id: 'safe', name: 'Safe' })),
}));

// Import config after mocks
import { config } from './config';

describe('Wallet Configuration', () => {
    it('should have the correct chain configuration', () => {
        expect(config.chains).toHaveLength(4);
        expect(config.chains.map((c) => c.id)).toContain(1); // Mainnet
        expect(config.chains.map((c) => c.id)).toContain(5000); // Mantle
        expect(config.chains.map((c) => c.id)).toContain(15000); // Mantle VTE
        expect(config.chains.map((c) => c.id)).toContain(10001); // Ethereum VTE
    });

    it('should include the Safe connector', () => {
        // In our mock, connectors is an array of connector objects
        // We added 'safe' connector manually AND 'safeWallet' from rainbowkit
        // The manual one is added first in the array in config.ts
        const safeConnector = config.connectors.find((c) => c.id === 'safe');
        expect(safeConnector).toBeDefined();
        expect(safeConnector?.name).toBe('Safe');
    });

    it('should have connectors from RainbowKit', () => {
        const connectorIds = config.connectors.map((c) => c.id);
        expect(connectorIds).toContain('safe');
        expect(connectorIds).toContain('rainbow');
        expect(connectorIds).toContain('metaMask');
    });
});
