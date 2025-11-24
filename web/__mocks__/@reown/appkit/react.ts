export const createAppKit = jest.fn()

export const useAppKit = jest.fn(() => ({
  open: jest.fn(),
  close: jest.fn(),
}))

export const useAppKitState = jest.fn(() => ({
  open: false,
  selectedNetworkId: 1,
}))

export const useAppKitAccount = jest.fn(() => ({
  address: '0x1234567890123456789012345678901234567890',
  isConnected: true,
}))

export const useAppKitNetwork = jest.fn(() => ({
  chainId: 1,
}))
