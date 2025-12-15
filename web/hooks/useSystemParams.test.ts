/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useSystemParams } from './useSystemParams'
import { useOraclePrice } from './useOraclePrice'

const mockUseMultiChainBatchRead = jest.fn()

jest.mock('@/lib/swr', () => ({
  useMultiChainBatchRead: (...args: unknown[]) => mockUseMultiChainBatchRead(...args),
  RefreshIntervals: {
    SYSTEM_PARAMS: 60000,
  },
}))

jest.mock('./useOraclePrice')

jest.mock('@/lib/contracts', () => ({
  contracts: {
    morpho: {
      address: '0xMorphoAddress' as `0x${string}`,
      chainId: 1,
    },
    navOracle: {
      address: '0xOracleAddress' as `0x${string}`,
      chainId: 1,
    },
  },
}))

jest.mock('@/lib/marketId', () => ({
  getMarketId: () => '0xMarketId' as `0x${string}`,
}))

const mockUseOraclePrice = useOraclePrice as jest.MockedFunction<typeof useOraclePrice>

describe('useSystemParams', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseOraclePrice.mockReturnValue({
      data: {
        value: '1.05',
        haircutPercentage: 2,
        isStale: false,
        raw: 1050000000000000000000000n,
      },
      isLoading: false,
      isError: false,
      error: null,
      isRefetching: false,
      refetch: jest.fn(),
    })
  })

  // Helper to mock batch results
  const mockBatch = (marketParams: unknown, marketData: unknown) => {
    mockUseMultiChainBatchRead.mockReturnValue({
      data: [marketParams, marketData],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    })
  }

  describe('LLTV Calculations', () => {
    it('should calculate LLTV percentage from raw value', () => {
      // 86% LLTV = 0.86 * 10^18
      const lltv86Percent = 860000000000000000n

      mockBatch(
        { lltv: lltv86Percent, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n, // 1000 USDC
          totalBorrowAssets: 500000000n,  // 500 USDC
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.lltv).toBeCloseTo(0.86, 2)
      expect(result.current.lltvPercentage).toBe('86%')
    })

    it('should handle 75% LLTV', () => {
      const lltv75Percent = 750000000000000000n

      mockBatch(
        { lltv: lltv75Percent, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n,
          totalBorrowAssets: 500000000n,
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.lltv).toBeCloseTo(0.75, 2)
      expect(result.current.lltvPercentage).toBe('75%')
    })

    it('should handle zero LLTV', () => {
      mockBatch(
        { lltv: 0n, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n,
          totalBorrowAssets: 500000000n,
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.lltv).toBe(0)
      expect(result.current.lltvPercentage).toBe('0%')
    })

    it('should handle undefined marketParams', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
        isRefetching: false,
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.lltv).toBe(0)
    })
  })

  describe('Liquidation Bonus', () => {
    it('should calculate bonus as (1/LLTV - 1) for 86% LLTV', () => {
      // 86% LLTV → 1/0.86 - 1 ≈ 0.163 (16%)
      const lltv86Percent = 860000000000000000n

      mockBatch(
        { lltv: lltv86Percent, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n,
          totalBorrowAssets: 500000000n,
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      // 1/0.86 - 1 ≈ 0.1628
      expect(result.current.liquidationBonus).toBeCloseTo(0.163, 2)
      expect(result.current.liquidationBonusPercentage).toBe('16%')
    })

    it('should calculate bonus for 75% LLTV', () => {
      // 75% LLTV → 1/0.75 - 1 = 0.333 (33%)
      const lltv75Percent = 750000000000000000n

      mockBatch(
        { lltv: lltv75Percent, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n,
          totalBorrowAssets: 500000000n,
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.liquidationBonus).toBeCloseTo(0.333, 2)
      expect(result.current.liquidationBonusPercentage).toBe('33%')
    })

    it('should return null when LLTV is 0', () => {
      mockBatch(
        { lltv: 0n, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n,
          totalBorrowAssets: 500000000n,
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.liquidationBonus).toBeNull()
      expect(result.current.liquidationBonusPercentage).toBeNull()
    })
  })

  describe('Utilization Rate', () => {
    it('should calculate utilization as borrow/supply * 100', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n, // 1000 USDC (6 decimals)
          totalBorrowAssets: 500000000n,  // 500 USDC
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      // 500/1000 * 100 = 50%
      expect(result.current.utilizationRate).toBe(50)
    })

    it('should handle 80% utilization', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n, // 1000 USDC
          totalBorrowAssets: 800000000n,  // 800 USDC
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.utilizationRate).toBe(80)
    })

    it('should handle zero supply (return 0)', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        {
          totalSupplyAssets: 0n,
          totalBorrowAssets: 0n,
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.utilizationRate).toBe(0)
    })

    it('should handle undefined market data', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: [{ lltv: 860000000000000000n, oracle: '0xOracle' }, undefined],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
        isRefetching: false,
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.utilizationRate).toBe(0)
    })
  })

  describe('Available Liquidity', () => {
    it('should calculate as supply - borrow', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n, // 1000 USDC
          totalBorrowAssets: 300000000n,  // 300 USDC
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      // 1000 - 300 = 700
      expect(result.current.availableLiquidity).toBe('700')
    })

    it('should handle zero borrow (full liquidity available)', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        {
          totalSupplyAssets: 1000000000n, // 1000 USDC
          totalBorrowAssets: 0n,
          fee: 0n,
          lastUpdate: 1234567890n,
        }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.availableLiquidity).toBe('1000')
    })

    it('should return null when market data is undefined', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
        isRefetching: false,
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.availableLiquidity).toBeNull()
    })
  })

  describe('Loading States', () => {
    it('should aggregate loading states - all loading', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: jest.fn(),
        isRefetching: false,
      })
      mockUseOraclePrice.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isRefetching: false,
        refetch: jest.fn(),
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.isLoading).toBe(true)
    })

    it('should be loading if only batch loading', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: jest.fn(),
        isRefetching: false,
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.isLoading).toBe(true)
    })

    it('should be loading if only oracle loading', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 0n, totalBorrowAssets: 0n, fee: 0n, lastUpdate: 0n }
      )
      mockUseOraclePrice.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isRefetching: false,
        refetch: jest.fn(),
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.isLoading).toBe(true)
    })

    it('should not be loading when all loaded', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 1000000000n, totalBorrowAssets: 500000000n, fee: 0n, lastUpdate: 1234567890n }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Error States', () => {
    it('should aggregate error states', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: jest.fn(),
        isRefetching: false,
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.isError).toBe(true)
    })

    it('should be error if oracle has error', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 0n, totalBorrowAssets: 0n, fee: 0n, lastUpdate: 0n }
      )
      mockUseOraclePrice.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Oracle error'),
        isRefetching: false,
        refetch: jest.fn(),
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.isError).toBe(true)
    })
  })

  describe('Oracle Integration', () => {
    it('should pass through oracle values', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 1000000000n, totalBorrowAssets: 500000000n, fee: 0n, lastUpdate: 1234567890n }
      )
      mockUseOraclePrice.mockReturnValue({
        data: {
          value: '1.0425',
          haircutPercentage: 2,
          isStale: false,
          raw: 1042500000000000000000000n,
        },
        isLoading: false,
        isError: false,
        error: null,
        isRefetching: false,
        refetch: jest.fn(),
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.oraclePrice).toBe('1.0425')
      expect(result.current.oracleHaircutPercentage).toBe(2)
      expect(result.current.oracleIsStale).toBe(false)
    })

    it('should use oracle address from marketParams', () => {
      const customOracle = '0xCustomOracle' as `0x${string}`
      mockBatch(
        { lltv: 860000000000000000n, oracle: customOracle },
        { totalSupplyAssets: 1000000000n, totalBorrowAssets: 500000000n, fee: 0n, lastUpdate: 1234567890n }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.oracleAddress).toBe(customOracle)
    })

    it('should fallback to contracts.navOracle.address when marketParams undefined', () => {
      mockUseMultiChainBatchRead.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
        isRefetching: false,
      })

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.oracleAddress).toBe('0xOracleAddress')
    })
  })

  describe('Fee Formatting', () => {
    it('should format fee percentage', () => {
      // 1% fee = 0.01 * 10^18
      const fee1Percent = 10000000000000000n

      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 1000000000n, totalBorrowAssets: 500000000n, fee: fee1Percent, lastUpdate: 1234567890n }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.fee).toBeCloseTo(0.01, 4)
      expect(result.current.feePercentage).toBe('1.00%')
    })

    it('should handle zero fee', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 1000000000n, totalBorrowAssets: 500000000n, fee: 0n, lastUpdate: 1234567890n }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.fee).toBe(0)
      expect(result.current.feePercentage).toBe('0.00%')
    })
  })

  describe('Last Update Timestamp', () => {
    it('should return lastUpdate timestamp', () => {
      const timestamp = 1702000000n

      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 1000000000n, totalBorrowAssets: 500000000n, fee: 0n, lastUpdate: timestamp }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.lastUpdate).toBe(1702000000)
    })

    it('should return null for zero timestamp', () => {
      mockBatch(
        { lltv: 860000000000000000n, oracle: '0xOracle' },
        { totalSupplyAssets: 1000000000n, totalBorrowAssets: 500000000n, fee: 0n, lastUpdate: 0n }
      )

      const { result } = renderHook(() => useSystemParams())

      expect(result.current.lastUpdate).toBeNull()
    })
  })
})
