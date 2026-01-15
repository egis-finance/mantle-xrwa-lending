/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useBorrowerDebt } from './useBorrowerDebt'

const mockUseMultiChainBatchRead = jest.fn()

jest.mock('@/lib/swr', () => ({
  useMultiChainBatchRead: (...args: unknown[]) => mockUseMultiChainBatchRead(...args),
  RefreshIntervals: {
    USER_POSITION: 15000,
  },
}))

jest.mock('@/lib/contracts', () => ({
  contracts: {
    morpho: {
      address: '0xMorphoAddress' as `0x${string}`,
      chainId: 1,
    },
  },
}))

jest.mock('@/lib/marketId', () => ({
  getMarketId: () => '0xabcdef' as `0x${string}`,
}))

describe('useBorrowerDebt', () => {
  const mockBorrowerAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`
  const mockRefetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Query Conditions', () => {
    it('should not query when borrower address is undefined', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(undefined))

      expect(result.current.data?.value).toBeUndefined()
      expect(mockUseMultiChainBatchRead).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      )
    })
  })

  describe('Debt Calculations', () => {
    it('should calculate debt correctly from shares', () => {
      const mockPosition = { borrowShares: 100000000000000000000n } // 100 shares (18 decimals)
      const mockMarket = {
        totalBorrowAssets: 1000000000n, // $1000 (6 decimals for USDC)
        totalBorrowShares: 200000000000000000000n, // 200 shares (18 decimals)
      }

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockPosition, mockMarket],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      // Expected: (100 * 1000) / 200 = 500 USDC = 500000000 raw (6 decimals)
      expect(result.current.data?.value).toBe('500')
      expect(result.current.data?.debtAssetsRaw).toBe(500000000n)
    })

    it('should return 0 when user has no borrow shares', () => {
      const mockPosition = { borrowShares: 0n }
      const mockMarket = {
        totalBorrowAssets: 1000000000n,
        totalBorrowShares: 200000000000000000000n,
      }

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockPosition, mockMarket],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.data?.value).toBe('0')
      expect(result.current.data?.debtAssetsRaw).toBe(0n)
    })

    it('should return null debtAssetsRaw when totalBorrowShares is 0 but user has shares', () => {
      const mockPosition = { borrowShares: 100000000000000000000n }
      const mockMarket = {
        totalBorrowAssets: 1000000000n,
        totalBorrowShares: 0n,
      }

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockPosition, mockMarket],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      // Impossible state: user has shares but market has none - can't compute debt
      expect(result.current.data?.value).toBeNull()
      expect(result.current.data?.debtAssetsRaw).toBeNull()
    })

    it('should handle large numbers correctly', () => {
      // $1,000,000 debt scenario
      const mockPosition = { borrowShares: 1000000000000000000000000n } // 1M shares
      const mockMarket = {
        totalBorrowAssets: 5000000000000n, // $5M in USDC (6 decimals)
        totalBorrowShares: 5000000000000000000000000n, // 5M shares
      }

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockPosition, mockMarket],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      // Expected: (1M * 5M) / 5M = 1M USDC
      expect(result.current.data?.value).toBe('1000000')
    })

    it('should handle fractional shares correctly', () => {
      // Small position
      const mockPosition = { borrowShares: 1500000000000000000n } // 1.5 shares
      const mockMarket = {
        totalBorrowAssets: 10000000n, // $10 USDC
        totalBorrowShares: 5000000000000000000n, // 5 shares
      }

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockPosition, mockMarket],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      // Expected: (1.5 * 10) / 5 = 3 USDC
      expect(result.current.data?.value).toBe('3')
    })
  })

  describe('Loading States', () => {
    it('should show loading state', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isLoading).toBe(true)
    })

    it('should not be loading when data is available', () => {
      const mockPosition = { borrowShares: 100000000000000000000n }
      const mockMarket = {
        totalBorrowAssets: 1000000000n,
        totalBorrowShares: 200000000000000000000n,
      }

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockPosition, mockMarket],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Error States', () => {
    it('should propagate error state', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('RPC error'),
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isError).toBe(true)
    })
  })

  describe('Return Values', () => {
    it('should return all expected values', () => {
      const mockBorrowShares = 100000000000000000000n
      const mockTotalBorrowAssets = 1000000000n
      const mockTotalBorrowShares = 200000000000000000000n
      // Expected debt: (100 * 1000) / 200 = 500 USDC = 500000000 raw
      const expectedDebtRaw = (mockBorrowShares * mockTotalBorrowAssets) / mockTotalBorrowShares

      const mockPosition = { borrowShares: mockBorrowShares }
      const mockMarket = {
        totalBorrowAssets: mockTotalBorrowAssets,
        totalBorrowShares: mockTotalBorrowShares,
      }

      mockUseMultiChainBatchRead.mockReturnValue({
        data: [mockPosition, mockMarket],
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.data?.value).toBe('500')
      expect(result.current.data?.debtAssetsRaw).toBe(expectedDebtRaw)
      expect(result.current.data?.borrowShares).toBe(mockBorrowShares)
      expect(result.current.data?.totalBorrowAssets).toBe(mockTotalBorrowAssets)
      expect(result.current.data?.totalBorrowShares).toBe(mockTotalBorrowShares)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
      expect(typeof result.current.refetch).toBe('function')
    })

    it('should return undefined data when not available', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.data).toBeUndefined()
    })
  })

  describe('Refetch', () => {
    it('should expose refetch function', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        isRefetching: false,
      })

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      result.current.refetch()

      expect(mockRefetch).toHaveBeenCalledTimes(1)
    })
  })
})
