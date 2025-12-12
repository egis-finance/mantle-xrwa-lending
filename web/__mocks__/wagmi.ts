// Mock wagmi hooks for testing
export const useReadContract = jest.fn(() => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
}))

export const useWriteContract = jest.fn(() => ({
  data: undefined,
  isLoading: false,
  isError: false,
  writeContract: jest.fn(),
}))

export const useAccount = jest.fn(() => ({
  address: undefined,
  isConnected: false,
}))

export const useChainId = jest.fn(() => 1)

export const useBalance = jest.fn(() => ({
  data: undefined,
  isLoading: false,
}))

export const WagmiProvider = ({ children }: { children: React.ReactNode }) => children
