/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useBorrowerDebt } from './useBorrowerDebt'
import { useReadContract } from 'wagmi'
import { contracts } from '@/lib/contracts'
import { getMarketId } from '@/lib/marketId'

// Mock wagmi and dependencies
jest.mock('wagmi')
jest.mock('@/lib/contracts', () => ({
  contracts: {
    morpho: {
      address: '0xMorphoAddress' as `0x${string}`,
      chainId: 1,
    },
  },
}))
jest.mock('@/lib/marketId')

const mockUseReadContract = useReadContract as jest.MockedFunction<typeof useReadContract>
const mockGetMarketId = getMarketId as jest.MockedFunction<typeof getMarketId>

describe('useBorrowerDebt', () => {
  const mockBorrowerAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`
  const mockMarketId = '0xabcdef' as `0x${string}`
  const mockRefetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetMarketId.mockReturnValue(mockMarketId)
    // Cast contracts to any to allow assignment
    ;(contracts as unknown as Record<string, unknown>).morpho = {
      address: '0xMorphoAddress' as `0x${string}`,
      chainId: 1,
    }
  })

  describe('Query Conditions', () => {
    it('should not query when borrower address is undefined', () => {
      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useBorrowerDebt(undefined))

      expect(result.current.value).toBeNull()
    })

    it('should not query when market ID is 0x0', () => {
      mockGetMarketId.mockReturnValue('0x0' as `0x${string}`)
      mockUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.value).toBeNull()
    })
  })

  describe('Debt Calculations', () => {
    it('should calculate debt correctly from shares', () => {
      // Mock position data: borrowShares = 100
      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: 100000000000000000000n }, // 100 shares (18 decimals)
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        // Mock market data
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: 1000000000n, // $1000 (6 decimals for USDC)
            totalBorrowShares: 200000000000000000000n, // 200 shares (18 decimals)
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      // Expected: (100 * 1000) / 200 = 500 USDC
      expect(result.current.value).toBe('500.0')
    })

    it('should return 0 when user has no borrow shares', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: 0n },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: 1000000000n,
            totalBorrowShares: 200000000000000000000n,
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.value).toBe('0')
    })

    it('should return 0 when total borrow shares is 0', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: 100000000000000000000n },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: 1000000000n,
            totalBorrowShares: 0n,
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.value).toBe('0')
    })

    it('should handle large numbers correctly', () => {
      // $1,000,000 debt scenario
      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: 1000000000000000000000000n }, // 1M shares
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: 5000000000000n, // $5M in USDC (6 decimals)
            totalBorrowShares: 5000000000000000000000000n, // 5M shares
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      // Expected: (1M * 5M) / 5M = 1M USDC
      expect(result.current.value).toBe('1000000.0')
    })

    it('should handle fractional shares correctly', () => {
      // Small position
      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: 1500000000000000000n }, // 1.5 shares
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: 10000000n, // $10 USDC
            totalBorrowShares: 5000000000000000000n, // 5 shares
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      // Expected: (1.5 * 10) / 5 = 3 USDC
      expect(result.current.value).toBe('3.0')
    })
  })

  describe('Loading States', () => {
    it('should show loading when position is loading', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: undefined,
          isLoading: true,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isLoading).toBe(true)
    })

    it('should show loading when market is loading', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: undefined,
          isLoading: true,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isLoading).toBe(true)
    })

    it('should not be loading when both queries complete', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: 100000000000000000000n },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: 1000000000n,
            totalBorrowShares: 200000000000000000000n,
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Error States', () => {
    it('should propagate position error', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: true,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isError).toBe(true)
    })

    it('should propagate market error', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: true,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.isError).toBe(true)
    })
  })

  describe('Return Values', () => {
    it('should return all expected values', () => {
      const mockBorrowShares = 100000000000000000000n
      const mockTotalBorrowAssets = 1000000000n
      const mockTotalBorrowShares = 200000000000000000000n

      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: mockBorrowShares },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: mockTotalBorrowAssets,
            totalBorrowShares: mockTotalBorrowShares,
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.value).toBe('500.0')
      expect(result.current.borrowShares).toBe(mockBorrowShares)
      expect(result.current.totalBorrowAssets).toBe(mockTotalBorrowAssets)
      expect(result.current.totalBorrowShares).toBe(mockTotalBorrowShares)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
      expect(typeof result.current.refetch).toBe('function')
    })

    it('should return null when data is not available', () => {
      mockUseReadContract
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)
        .mockReturnValueOnce({
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: mockRefetch,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      expect(result.current.value).toBeNull()
    })
  })

  describe('Refetch', () => {
    it('should call both refetch functions', () => {
      const mockRefetch1 = jest.fn()
      const mockRefetch2 = jest.fn()

      mockUseReadContract
        .mockReturnValueOnce({
          data: { borrowShares: 100000000000000000000n },
          isLoading: false,
          isError: false,
          refetch: mockRefetch1,
        } as any)
        .mockReturnValueOnce({
          data: {
            totalBorrowAssets: 1000000000n,
            totalBorrowShares: 200000000000000000000n,
          },
          isLoading: false,
          isError: false,
          refetch: mockRefetch2,
        } as any)

      const { result } = renderHook(() => useBorrowerDebt(mockBorrowerAddress))

      result.current.refetch()

      expect(mockRefetch1).toHaveBeenCalledTimes(1)
      expect(mockRefetch2).toHaveBeenCalledTimes(1)
    })
  })
})

