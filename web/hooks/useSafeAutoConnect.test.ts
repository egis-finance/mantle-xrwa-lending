/* eslint-disable @typescript-eslint/no-require-imports */

import { renderHook } from '@testing-library/react'
import { useSafeAutoConnect } from './useSafeAutoConnect'

jest.mock('wagmi', () => ({
  useConnect: jest.fn(() => ({
    connect: mockConnect,
    connectors: [
      { id: 'safe', name: 'Safe' },
      { id: 'injected', name: 'Injected' },
    ],
  })),
  useAccount: jest.fn(() => ({
    isConnected: false,
  })),
}))

jest.mock('@safe-global/safe-apps-react-sdk', () => ({
  useSafeAppsSDK: jest.fn(() => ({
    safe: { safeAddress: '0xSafeAddress', chainId: 1 },
    connected: true,
  })),
}))

const mockConnect = jest.fn()

describe('useSafeAutoConnect', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should auto-connect to Safe when in Safe context and not connected', () => {
    renderHook(() => useSafeAutoConnect())

    expect(mockConnect).toHaveBeenCalledWith({
      connector: { id: 'safe', name: 'Safe' },
    })
  })

  it('should not connect when already connected', () => {
    const { useAccount } = require('wagmi')
    useAccount.mockReturnValue({ isConnected: true })

    renderHook(() => useSafeAutoConnect())

    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('should not connect when not in Safe context', () => {
    const { useSafeAppsSDK } = require('@safe-global/safe-apps-react-sdk')
    useSafeAppsSDK.mockReturnValue({ safe: null, connected: false })

    renderHook(() => useSafeAutoConnect())

    expect(mockConnect).not.toHaveBeenCalled()
  })
})
