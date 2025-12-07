/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { useLoanHealth } from '../useLoanHealth'
import { useBorrowerCollateral } from '../useBorrowerCollateral'
import { useBorrowerDebt } from '../useBorrowerDebt'
import { useOraclePrice } from '../useOraclePrice'

// Mock the dependency hooks
jest.mock('../useBorrowerCollateral')
jest.mock('../useBorrowerDebt')
jest.mock('../useOraclePrice')

const mockUseBorrowerCollateral = useBorrowerCollateral as jest.MockedFunction<typeof useBorrowerCollateral>
const mockUseBorrowerDebt = useBorrowerDebt as jest.MockedFunction<typeof useBorrowerDebt>
const mockUseOraclePrice = useOraclePrice as jest.MockedFunction<typeof useOraclePrice>

describe('useLoanHealth', () => {
  const mockRefetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Loading States', () => {
    it('should return isLoading true when any dependency is loading', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: null,
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: null,
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: null,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.isLoading).toBe(true)
    })

    it('should return isLoading false when all dependencies are loaded', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '50',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.05',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('No Position (All Zeros)', () => {
    it('should handle no collateral or debt gracefully', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: '0',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '0',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.05',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.collateralValue).toBe(0)
      expect(result.current.debtValue).toBe(0)
      expect(result.current.ltv).toBe(0)
      expect(result.current.healthFactor).toBe(Infinity)
      expect(result.current.isHealthy).toBe(true)
      expect(result.current.riskLevel).toBe('safe')
    })
  })

  describe('Safe Position', () => {
    it('should calculate safe position metrics correctly', () => {
      // Collateral: 100 AcUSDY @ $1.05 = $105
      // Debt: $50
      // LTV: 50/105 = 47.6%
      // Health Factor: (105 * 0.75) / 50 = 1.575
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '50',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.05',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.collateralValue).toBeCloseTo(105, 2)
      expect(result.current.debtValue).toBeCloseTo(50, 2)
      expect(result.current.ltv).toBeCloseTo(47.62, 1)
      expect(result.current.healthFactor).toBeCloseTo(1.575, 2)
      expect(result.current.isHealthy).toBe(true)
      expect(result.current.riskLevel).toBe('safe')
    })

    it('should show safe risk level for LTV below 67.5%', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '60',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.0',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.ltv).toBeCloseTo(60, 1)
      expect(result.current.riskLevel).toBe('safe')
    })
  })

  describe('Warning Position', () => {
    it('should show warning risk level for LTV between 67.5% and 75%', () => {
      // Collateral: 100 @ $1.00 = $100
      // Debt: $70
      // LTV: 70%
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '70',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.0',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.ltv).toBeCloseTo(70, 1)
      expect(result.current.healthFactor).toBeCloseTo(1.071, 2)
      expect(result.current.isHealthy).toBe(true)
      expect(result.current.riskLevel).toBe('warning')
    })

    it('should calculate liquidation price correctly', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '70',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.0',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      // Liquidation price = debt / (collateral * 0.75)
      // = 70 / (100 * 0.75) = 70 / 75 = 0.9333
      expect(result.current.liquidationPrice).toBeCloseTo(0.9333, 3)
    })
  })

  describe('Danger Position', () => {
    it('should show danger risk level for LTV >= 75%', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '75',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.0',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.ltv).toBeCloseTo(75, 1)
      expect(result.current.healthFactor).toBeCloseTo(1.0, 2)
      expect(result.current.isHealthy).toBe(true) // Exactly at threshold
      expect(result.current.riskLevel).toBe('danger')
    })

    it('should show unhealthy when health factor < 1', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '80', // More than 75% LTV
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.0',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.ltv).toBeCloseTo(80, 1)
      expect(result.current.healthFactor).toBeCloseTo(0.9375, 3)
      expect(result.current.isHealthy).toBe(false)
      expect(result.current.riskLevel).toBe('danger')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null values from hooks', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: null,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: null,
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: null,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.collateralValue).toBeNull()
      expect(result.current.debtValue).toBeNull()
      expect(result.current.ltv).toBeNull()
      expect(result.current.healthFactor).toBeNull()
      expect(result.current.isHealthy).toBe(true) // Default to safe
      expect(result.current.riskLevel).toBe('safe')
    })

    it('should handle collateral but no debt', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '0',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.05',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.collateralValue).toBeCloseTo(105, 2)
      expect(result.current.debtValue).toBe(0)
      expect(result.current.ltv).toBe(0)
      expect(result.current.healthFactor).toBe(Infinity)
      expect(result.current.isHealthy).toBe(true)
      expect(result.current.riskLevel).toBe('safe')
    })

    it('should call all refetch functions', () => {
      const mockRefetch1 = jest.fn()
      const mockRefetch2 = jest.fn()
      const mockRefetch3 = jest.fn()

      mockUseBorrowerCollateral.mockReturnValue({
        value: '100',
        isLoading: false,
        isError: false,
        refetch: mockRefetch1,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: '50',
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch2,
      })
      mockUseOraclePrice.mockReturnValue({
        value: '1.05',
        isLoading: false,
        isError: false,
        refetch: mockRefetch3,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      result.current.refetch()

      expect(mockRefetch1).toHaveBeenCalledTimes(1)
      expect(mockRefetch2).toHaveBeenCalledTimes(1)
      expect(mockRefetch3).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error States', () => {
    it('should propagate error state from dependencies', () => {
      mockUseBorrowerCollateral.mockReturnValue({
        value: null,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
        data: undefined,
      })
      mockUseBorrowerDebt.mockReturnValue({
        value: null,
        borrowShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })
      mockUseOraclePrice.mockReturnValue({
        value: null,
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        data: undefined,
      })

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`))

      expect(result.current.isError).toBe(true)
    })
  })
})

