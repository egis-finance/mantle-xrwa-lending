/**
 * Integration test for wallet connection flow
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { renderHook, act } from '@testing-library/react'

const mockConnect = jest.fn()
const mockDisconnect = jest.fn()

jest.mock('wagmi', () => ({
  useConnect: jest.fn(() => ({
    connect: mockConnect,
    connectors: [
      { id: 'safe', name: 'Safe', ready: true },
      { id: 'injected', name: 'MetaMask', ready: true },
      { id: 'walletConnect', name: 'WalletConnect', ready: true },
    ],
    isPending: false,
  })),
  useAccount: jest.fn(() => ({
    address: undefined,
    isConnected: false,
  })),
  useDisconnect: jest.fn(() => ({
    disconnect: mockDisconnect,
  })),
}))

jest.mock('@safe-global/safe-apps-react-sdk', () => ({
  useSafeAppsSDK: jest.fn(() => ({
    safe: null,
    connected: false,
  })),
}))

describe('Wallet Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Wallet Connection', () => {
    it('should have access to multiple wallet connectors', () => {
      const { useConnect } = require('wagmi')
      const hook = renderHook(() => useConnect())

      expect(hook.result.current.connectors).toHaveLength(3)
      expect(hook.result.current.connectors.map((c: { id: string }) => c.id)).toEqual([
        'safe',
        'injected',
        'walletConnect',
      ])
    })

    it('should allow connecting to a wallet', () => {
      const { useConnect } = require('wagmi')
      const hook = renderHook(() => useConnect())

      const safeConnector = hook.result.current.connectors[0]

      act(() => {
        hook.result.current.connect({ connector: safeConnector })
      })

      expect(mockConnect).toHaveBeenCalledWith({
        connector: safeConnector,
      })
    })

    it('should handle Safe App context', () => {
      const { useSafeAppsSDK } = require('@safe-global/safe-apps-react-sdk')
      useSafeAppsSDK.mockReturnValue({
        safe: { safeAddress: '0xSafe123', chainId: 1 },
        connected: true,
      })

      const hook = renderHook(() => useSafeAppsSDK())

      expect(hook.result.current.safe).toBeDefined()
      expect(hook.result.current.safe.safeAddress).toBe('0xSafe123')
      expect(hook.result.current.connected).toBe(true)
    })
  })

  describe('Wallet Disconnection', () => {
    it('should allow disconnecting from wallet', () => {
      const { useAccount, useDisconnect } = require('wagmi')
      useAccount.mockReturnValue({
        address: '0x123',
        isConnected: true,
      })

      const hook = renderHook(() => useDisconnect())

      act(() => {
        hook.result.current.disconnect()
      })

      expect(mockDisconnect).toHaveBeenCalled()
    })
  })
})
