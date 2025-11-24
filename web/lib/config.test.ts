// Mock dependencies BEFORE importing config
jest.mock('@wagmi/core', () => ({
    cookieStorage: {},
    createStorage: jest.fn(() => ({})),
}));

jest.mock('@reown/appkit-adapter-wagmi', () => ({
    WagmiAdapter: jest.fn().mockImplementation(() => ({
        wagmiConfig: {
            chains: [
                { id: 1, name: 'Ethereum' },
                { id: 5000, name: 'Mantle' },
                { id: 15000, name: 'Mantle VTE' },
                { id: 10001, name: 'Ethereum VTE' },
            ],
            connectors: [],
            transports: {},
        },
    })),
}));

jest.mock('@reown/appkit/networks', () => ({
    mainnet: { id: 1, name: 'Ethereum' },
    mantle: { id: 5000, name: 'Mantle' },
}));

// Import config after mocks
import { config, projectId, networks } from './config';

describe('Wallet Configuration', () => {
    it('should export project ID', () => {
        expect(projectId).toBe('38ab5a2e51b9757e06fe37a5261e800a');
    });

    it('should export networks array with 4 chains', () => {
        expect(networks).toHaveLength(4);
        expect(networks.map((n) => n.id)).toContain(1); // Mainnet
        expect(networks.map((n) => n.id)).toContain(5000); // Mantle
        expect(networks.map((n) => n.id)).toContain(15000); // Mantle VTE
        expect(networks.map((n) => n.id)).toContain(10001); // Ethereum VTE
    });

    it('should have wagmi config from adapter', () => {
        expect(config).toBeDefined();
        expect(config.chains).toHaveLength(4);
    });
});
