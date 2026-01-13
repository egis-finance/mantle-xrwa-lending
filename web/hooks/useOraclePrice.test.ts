/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useOraclePrice } from './useOraclePrice'

const mockUseMultiChainBatchRead = jest.fn()
const mockUseMultiChainRead = jest.fn()

jest.mock('@/lib/swr', () => ({
  useMultiChainBatchRead: (...args: unknown[]) => mockUseMultiChainBatchRead(...args),
  useMultiChainRead: (...args: unknown[]) => mockUseMultiChainRead(...args),
  RefreshIntervals: {
    ORACLE_PRICE: 10000,
  },
}))

jest.mock('@/lib/contracts', () => ({
  contracts: {
    navOracle: {
      address: '0xOracleAddress' as `0x${string}`,
      chainId: 1,
    },
  },
}))

describe('useOraclePrice', () => {
  const mockRefetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    // Default mock for haircut
    mockUseMultiChainRead.mockReturnValue({
      data: 200n, // 2% haircut (200 BPS)
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    })
  })

  describe('Price Fetching', () => {
    it('should format oracle price correctly', () => {
      // Morpho oracle precision: 10^(36 + loanDecimals - collateralDecimals)
      // For USDC (6) / AcUSDY (18): 10^(36 + 6 - 18) = 10^24
      // 1.05 = 1050000000000000000000000n (1.05 * 10^24)
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBe('1.05')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
    })

    it('should handle price of 1.0', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1000000000000000000000000n, false], // 1.0 * 10^24
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBe('1')
    })

    it('should handle high precision prices', () => {
      // 1.0425 * 10^24
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1042500000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBe('1.0425')
    })

    it('should handle zero price', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [0n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBe('0')
    })

    it('should handle very large prices', () => {
      // $1000 * 10^24
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1000000000000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBe('1000')
    })

    it('should handle very small prices', () => {
      // $0.01 * 10^24
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [10000000000000000000000n, false], // 0.01 * 10^24
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBe('0.01')
    })
  })

  describe('Haircut', () => {
    it('should calculate haircut percentage correctly', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })
      mockUseMultiChainRead.mockReturnValue({
        data: 200n, // 200 BPS = 2%
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.haircutPercentage).toBe(2)
    })
  })

  describe('Staleness', () => {
    it('should return isStale from oracle', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, true],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.isStale).toBe(true)
    })

    it('should return price even when stale (getPriceWithHaircut never reverts)', () => {
      // Key scenario: oracle is stale but getPriceWithHaircut() still returns a price
      // This verifies the B1 fix - using getPriceWithHaircut instead of price()
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, true], // stale = true
        isLoading: false,
        isError: false, // no error despite staleness
        refetch: mockRefetch,
        isRefetching: false,
      })
      mockUseMultiChainRead.mockReturnValue({
        data: 200n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      // Price should still be available
      expect(result.current.data?.value).toBe('1.05')
      expect(result.current.data?.raw).toBe(1050000000000000000000000n)
      // Staleness should be flagged
      expect(result.current.data?.isStale).toBe(true)
      // No error state - UI can show warning instead of error
      expect(result.current.isError).toBe(false)
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Loading States', () => {
    it('should return loading state when batch loading', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.isLoading).toBe(true)
    })

    it('should return loading state when haircut loading', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })
      mockUseMultiChainRead.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.isLoading).toBe(true)
    })

    it('should not be loading when both loaded', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Error States', () => {
    it('should return error state from batch', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('RPC error'),
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBeNull()
      expect(result.current.isError).toBe(true)
    })

    it('should return error state from haircut', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })
      mockUseMultiChainRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('RPC error'),
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.isError).toBe(true)
    })
  })

  describe('Refetch', () => {
    it('should expose refetch function', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [1050000000000000000000000n, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(typeof result.current.refetch).toBe('function')
    })
  })

  describe('Return Values', () => {
    it('should return all expected values', () => {
      const mockData = 1050000000000000000000000n

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockData, false],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })
      mockUseMultiChainRead.mockReturnValue({
        data: 200n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBe('1.05')
      expect(result.current.data?.haircutPercentage).toBe(2)
      expect(result.current.data?.isStale).toBe(false)
      expect(result.current.data?.raw).toBe(mockData)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
      expect(typeof result.current.refetch).toBe('function')
    })

    it('should return null value when data is undefined', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useOraclePrice())

      expect(result.current.data?.value).toBeNull()
    })
  })
})
