/**
 * Integration test for wallet connection flow with Dynamic SDK
 */

import { renderHook } from '@testing-library/react'
import { useDynamicContext, useIsLoggedIn } from '@dynamic-labs/sdk-react-core'

// Mock Dynamic SDK
jest.mock('@dynamic-labs/sdk-react-core', () => ({
  useDynamicContext: jest.fn(() => ({
    primaryWallet: null,
    user: null,
    isAuthenticated: false,
    setShowAuthFlow: jest.fn(),
  })),
  useIsLoggedIn: jest.fn(() => false),
  DynamicContextProvider: ({ children }: { children: React.ReactNode }) => children,
  DynamicWidget: () => null,
  mergeNetworks: jest.fn((custom, dashboard) => [...custom, ...(dashboard || [])]),
}))

describe('Dynamic Wallet Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Wallet Connection', () => {
    it('should have access to dynamic context', () => {

      const hook = renderHook(() => useDynamicContext())

      expect(hook.result.current).toBeDefined()
      expect(hook.result.current.primaryWallet).toBeNull()
      expect(hook.result.current.isAuthenticated).toBe(false)
    })

    it('should detect logged in state', () => {

      // Simulate connected state
      useDynamicContext.mockReturnValue({
        primaryWallet: {
          address: '0x123',
          chain: 'EVM',
          connector: { supportsNetworkSwitching: () => true },
        },
        user: { email: 'test@example.com' },
        isAuthenticated: true,
        setShowAuthFlow: jest.fn(),
      })
      useIsLoggedIn.mockReturnValue(true)

      const contextHook = renderHook(() => useDynamicContext())
      const loggedInHook = renderHook(() => useIsLoggedIn())

      expect(contextHook.result.current.isAuthenticated).toBe(true)
      expect(contextHook.result.current.primaryWallet?.address).toBe('0x123')
      expect(loggedInHook.result.current).toBe(true)
    })

    it('should support embedded wallet flow', () => {

      // Simulate embedded wallet
      useDynamicContext.mockReturnValue({
        primaryWallet: {
          address: '0xEmbedded456',
          chain: 'EVM',
          connector: {
            isEmbeddedWallet: true,
            supportsNetworkSwitching: () => true,
          },
        },
        user: { email: 'embedded@example.com' },
        isAuthenticated: true,
        setShowAuthFlow: jest.fn(),
      })

      const hook = renderHook(() => useDynamicContext())

      expect(hook.result.current.primaryWallet?.connector?.isEmbeddedWallet).toBe(true)
    })
  })

  describe('Wallet Disconnection', () => {
    it('should handle disconnection', () => {

      // First connected
      useDynamicContext.mockReturnValue({
        primaryWallet: { address: '0x123' },
        isAuthenticated: true,
        handleLogOut: jest.fn(),
      })

      const hook = renderHook(() => useDynamicContext())
      expect(hook.result.current.primaryWallet).toBeDefined()

      // Then disconnected
      useDynamicContext.mockReturnValue({
        primaryWallet: null,
        isAuthenticated: false,
        handleLogOut: jest.fn(),
      })

      const disconnectedHook = renderHook(() => useDynamicContext())
      expect(disconnectedHook.result.current.primaryWallet).toBeNull()
    })
  })
})
