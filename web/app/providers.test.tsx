import { render } from '@testing-library/react';
import { Providers } from './providers';

// Mocks are handled by jest.config.js moduleNameMapper
// @dynamic-labs/sdk-react-core -> __mocks__/dynamic.ts
// @dynamic-labs/ethereum -> __mocks__/dynamicEthereum.ts
// swr -> __mocks__/swr.ts

jest.mock('@/lib/env', () => ({
  getEnv: jest.fn(() => ({
    dynamicEnvId: 'test-env-id',
    useMainnet: false,
    rpc: {
      mantleVte: 'http://localhost:8545',
      ethereumVte: 'http://localhost:8546',
      mantleMainnet: 'https://rpc.mantle.xyz',
      ethereumMainnet: 'https://eth.llamarpc.com',
    },
    explorer: {
      mantleVte: '',
      ethereumVte: '',
      mantleMainnet: 'https://mantlescan.xyz',
      ethereumMainnet: 'https://etherscan.io',
    },
  })),
}));

jest.mock('@/lib/dynamic/chains', () => ({
  supportedNetworks: [],
  MANTLE_CHAIN_ID: 15000,
  ETHEREUM_CHAIN_ID: 10001,
}));

describe('Providers', () => {
  it('renders children within provider tree', () => {
    const { getByText } = render(
      <Providers>
        <div>Test Child</div>
      </Providers>
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });
});
