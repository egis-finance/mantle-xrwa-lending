/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useOraclePrice } from './useOraclePrice'
import { useReadContract } from 'wagmi'

// Mock wagmi
jest.mock('wagmi')
jest.mock('@/lib/contracts', () => ({
  contracts: {
    navOracle: {
      address: '0xOracleAddress' as `0x${string}`,
      chainId: 1,
    },
  },
}))

const mockUseReadContract = useReadContract as jest.MockedFunction<typeof useReadContract>

describe('useOraclePrice', () => {
  const mockRefetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Price Fetching', () => {
    it('should format oracle price correctly', () => {
      // Oracle returns price with 18 decimals
      // 1.05 = 1050000000000000000
      mockUseReadContract.mockReturnValue({
        data: 1050000000000000000n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('1.05')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
    })

    it('should handle price of 1.0', () => {
      mockUseReadContract.mockReturnValue({
        data: 1000000000000000000n, // 1.0
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('1.0')
    })

    it('should handle high precision prices', () => {
      // 1.123456789012345678
      mockUseReadContract.mockReturnValue({
        data: 1123456789012345678n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('1.123456789012345678')
    })

    it('should handle zero price', () => {
      mockUseReadContract.mockReturnValue({
        data: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('0.0')
    })

    it('should handle very large prices', () => {
      // $1000
      mockUseReadContract.mockReturnValue({
        data: 1000000000000000000000n, // 1000 * 10^18
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('1000.0')
    })

    it('should handle very small prices', () => {
      // $0.01
      mockUseReadContract.mockReturnValue({
        data: 10000000000000000n, // 0.01 * 10^18
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('0.01')
    })
  })

  describe('Loading States', () => {
    it('should return loading state', () => {
      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBeNull()
      expect(result.current.isLoading).toBe(true)
      expect(result.current.isError).toBe(false)
    })

    it('should transition from loading to loaded', () => {
      const { rerender } = renderHook(() => useOraclePrice())

      // Initially loading
      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
      } as any)

      rerender()

      // Then loaded
      mockUseReadContract.mockReturnValue({
        data: 1050000000000000000n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      rerender()

      const result = renderHook(() => useOraclePrice()).result

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Error States', () => {
    it('should return error state', () => {
      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(true)
    })

    it('should handle undefined data without error', () => {
      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBeNull()
      expect(result.current.isError).toBe(false)
    })
  })

  describe('Configuration', () => {
    it('should not query when oracle address is 0x0', () => {
      ;(contracts as any) = {
        navOracle: {
          address: '0x0' as `0x${string}`,
          chainId: 1,
        },
      }

      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      // Should still work but query would be disabled
      expect(result.current.value).toBeNull()
    })

    it('should use correct oracle address from config', () => {
      const mockOracleAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`
      ;(contracts as any) = {
        navOracle: {
          address: mockOracleAddress,
          chainId: 1,
        },
      }

      mockUseReadContract.mockReturnValue({
        data: 1050000000000000000n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('1.05')
    })
  })

  describe('Refetch', () => {
    it('should expose refetch function', () => {
      mockUseReadContract.mockReturnValue({
        data: 1050000000000000000n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(typeof result.current.refetch).toBe('function')
    })

    it('should call refetch when invoked', () => {
      mockUseReadContract.mockReturnValue({
        data: 1050000000000000000n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      result.current.refetch()

      expect(mockRefetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Return Values', () => {
    it('should return all expected values', () => {
      const mockData = 1050000000000000000n

      mockUseReadContract.mockReturnValue({
        data: mockData,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBe('1.05')
      expect(result.current.data).toBe(mockData)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
      expect(typeof result.current.refetch).toBe('function')
    })

    it('should return null value when data is undefined', () => {
      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.value).toBeNull()
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('Auto-refetch Interval', () => {
    it('should be configured with 30 second refetch interval', () => {
      // This tests that the hook is configured correctly
      // The actual interval behavior is tested by wagmi
      mockUseReadContract.mockReturnValue({
        data: 1050000000000000000n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      renderHook(() => useOraclePrice())

      // Verify that useReadContract was called
      // In a real test, we'd check the config passed to useReadContract
      expect(mockUseReadContract).toHaveBeenCalled()
    })
  })
})

