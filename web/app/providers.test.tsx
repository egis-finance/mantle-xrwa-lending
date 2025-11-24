import { render } from '@testing-library/react'
import { Providers } from './providers'

jest.mock('@reown/appkit/react', () => ({
  createAppKit: jest.fn(),
}))

jest.mock('@/lib/config', () => ({
  wagmiAdapter: {
    wagmiConfig: {
      chains: [],
      connectors: [],
    },
  },
  projectId: 'test-project-id',
  networks: [],
}))

jest.mock('wagmi', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  cookieToInitialState: jest.fn(() => ({})),
}))

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@safe-global/safe-apps-react-sdk', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('Providers', () => {
  it('renders children within provider tree', () => {
    const { getByText } = render(
      <Providers cookies={null}>
        <div>Test Child</div>
      </Providers>
    )

    expect(getByText('Test Child')).toBeInTheDocument()
  })

  it('handles SSR cookies', () => {
    const testCookies = 'test-cookie=value'
    const { getByText } = render(
      <Providers cookies={testCookies}>
        <div>Test Child</div>
      </Providers>
    )

    expect(getByText('Test Child')).toBeInTheDocument()
  })
})
