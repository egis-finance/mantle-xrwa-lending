/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { parseUnits } from 'viem'
import { useLoanHealth } from './useLoanHealth'
import { useMorphoCollateral } from './useMorphoCollateral'
import { useBorrowerDebt } from './useBorrowerDebt'
import { useOraclePrice } from './useOraclePrice'

// Mock the dependency hooks
jest.mock('./useMorphoCollateral')
jest.mock('./useBorrowerDebt')
jest.mock('./useOraclePrice')

const mockUseMorphoCollateral = useMorphoCollateral as jest.MockedFunction<typeof useMorphoCollateral>
const mockUseBorrowerDebt = useBorrowerDebt as jest.MockedFunction<typeof useBorrowerDebt>
const mockUseOraclePrice = useOraclePrice as jest.MockedFunction<typeof useOraclePrice>

describe('useLoanHealth', () => {
  const mockRefetch = jest.fn()

  // Helper to create collateral mock with proper structure
  const mockCollateral = (value: string | null, isLoading = false, isError = false) => ({
    data: value !== null ? { value } : undefined,
    isLoading,
    isError,
    error: null,
    isRefetching: false,
    refetch: mockRefetch,
  })

  // Helper to create debt mock with proper structure
  const mockDebt = (value: string | null, isLoading = false, isError = false) => ({
    data: value !== null ? {
      value,
      borrowShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
    } : undefined,
    isLoading,
    isError,
    error: null,
    isRefetching: false,
    refetch: mockRefetch,
  })

  // Helper to create oracle price mock with proper structure
  const mockOracle = (value: string | null, isLoading = false, isError = false) => ({
    data: value !== null ? {
      value,
      haircutPercentage: 2,
      isStale: false,
      raw: parseUnits(value || '0', 24),
    } : undefined,
    isLoading,
    isError,
    error: null,
    isRefetching: false,
    refetch: mockRefetch,
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Loading States', () => {
    it('should return isLoading true when any dependency is loading', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral(null, true) as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt(null) as any)
      mockUseOraclePrice.mockReturnValue(mockOracle(null) as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.isLoading).toBe(true)
    })

    it('should return isLoading false when all dependencies are loaded', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('50') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.05') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('No Position (All Zeros)', () => {
    it('should handle no collateral or debt gracefully', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('0') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('0') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.05') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.collateralValue).toBe(0)
      expect(result.current.debtValue).toBe(0)
      expect(result.current.ltv).toBe(0)
      expect(result.current.healthFactor).toBe(Infinity)
      expect(result.current.isHealthy).toBe(true)
      expect(result.current.riskLevel).toBe('safe')
    })
  })

  describe('Safe Position', () => {
    it('should calculate safe position metrics correctly with explicit 75% LLTV', () => {
      // Collateral: 100 AcUSDY @ $1.05 = $105
      // Debt: $50
      // LTV: 50/105 = 47.6%
      // Health Factor: (105 * 0.75) / 50 = 1.575
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('50') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.05') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.75 }))

      expect(result.current.collateralValue).toBeCloseTo(105, 2)
      expect(result.current.debtValue).toBeCloseTo(50, 2)
      expect(result.current.ltv).toBeCloseTo(47.62, 1)
      expect(result.current.healthFactor).toBeCloseTo(1.575, 2)
      expect(result.current.isHealthy).toBe(true)
      expect(result.current.riskLevel).toBe('safe')
    })

    it('should show safe risk level for LTV below 67.5% with 75% LLTV', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('60') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.75 }))

      expect(result.current.ltv).toBeCloseTo(60, 1)
      expect(result.current.riskLevel).toBe('safe')
    })
  })

  describe('Warning Position', () => {
    it('should show warning risk level for LTV between 67.5% and 75% with 75% LLTV', () => {
      // Collateral: 100 @ $1.00 = $100
      // Debt: $70
      // LTV: 70%
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('70') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.75 }))

      expect(result.current.ltv).toBeCloseTo(70, 1)
      expect(result.current.healthFactor).toBeCloseTo(1.071, 2)
      expect(result.current.isHealthy).toBe(true)
      expect(result.current.riskLevel).toBe('warning')
    })

    it('should calculate liquidation price correctly with 75% LLTV', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('70') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.75 }))

      // Liquidation price = debt / (collateral * 0.75)
      // = 70 / (100 * 0.75) = 70 / 75 = 0.9333
      expect(result.current.liquidationPrice).toBeCloseTo(0.9333, 3)
    })
  })

  describe('Danger Position', () => {
    it('should show danger risk level for LTV >= 75% with 75% LLTV', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('75') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.75 }))

      expect(result.current.ltv).toBeCloseTo(75, 1)
      expect(result.current.healthFactor).toBeCloseTo(1.0, 2)
      expect(result.current.isHealthy).toBe(true) // Exactly at threshold
      expect(result.current.riskLevel).toBe('danger')
    })

    it('should show unhealthy when health factor < 1 with 75% LLTV', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('80') as any) // More than 75% LTV
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.75 }))

      expect(result.current.ltv).toBeCloseTo(80, 1)
      expect(result.current.healthFactor).toBeCloseTo(0.9375, 3)
      expect(result.current.isHealthy).toBe(false)
      expect(result.current.riskLevel).toBe('danger')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null values from hooks', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral(null) as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt(null) as any)
      mockUseOraclePrice.mockReturnValue(mockOracle(null) as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.collateralValue).toBeNull()
      expect(result.current.debtValue).toBeNull()
      expect(result.current.ltv).toBeNull()
      expect(result.current.healthFactor).toBeNull()
      expect(result.current.isHealthy).toBe(true) // Default to safe
      expect(result.current.riskLevel).toBe('safe')
    })

    it('should handle collateral but no debt', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('0') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.05') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

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

      mockUseMorphoCollateral.mockReturnValue({
        data: { value: '100' },
        isLoading: false,
        isError: false,
        error: null,
        isRefetching: false,
        refetch: mockRefetch1,
      } as any)
      mockUseBorrowerDebt.mockReturnValue({
        data: { value: '50', borrowShares: 0n, totalBorrowAssets: 0n, totalBorrowShares: 0n },
        isLoading: false,
        isError: false,
        error: null,
        isRefetching: false,
        refetch: mockRefetch2,
      } as any)
      mockUseOraclePrice.mockReturnValue({
        data: { value: '1.05', haircutPercentage: 2, isStale: false, raw: 0n },
        isLoading: false,
        isError: false,
        error: null,
        isRefetching: false,
        refetch: mockRefetch3,
      } as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      result.current.refetch()

      expect(mockRefetch1).toHaveBeenCalledTimes(1)
      expect(mockRefetch2).toHaveBeenCalledTimes(1)
      expect(mockRefetch3).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error States', () => {
    it('should propagate error state from dependencies', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral(null, false, true) as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt(null) as any)
      mockUseOraclePrice.mockReturnValue(mockOracle(null) as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.isError).toBe(true)
    })
  })

  describe('LLTV Calculations with 86%', () => {
    it('should calculate health factor correctly with 86% LLTV', () => {
      // Collateral: 100 @ $1.00 = $100
      // Debt: $80
      // LTV: 80%
      // Health Factor with 86% LLTV: (100 * 0.86) / 80 = 1.075
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('80') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.healthFactor).toBeCloseTo(1.075, 2)
      // 80% LTV is warning with 86% LLTV (warning starts at 77.4%)
      expect(result.current.riskLevel).toBe('warning')
    })

    it('should calculate warning threshold at 90% of 86% LLTV (~77.4%)', () => {
      // 77.4% LTV = 90% of 86% = warning threshold
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('77.4') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.riskLevel).toBe('warning')
    })

    it('should show safe for LTV below 77.4% with 86% LLTV', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('70') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.ltv).toBeCloseTo(70, 1)
      expect(result.current.riskLevel).toBe('safe')
    })

    it('should show danger at 86% LLTV threshold', () => {
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('86') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.riskLevel).toBe('danger')
      expect(result.current.healthFactor).toBeCloseTo(1.0, 2)
    })

    it('should calculate correct liquidation price with 86% LLTV', () => {
      // Liquidation price = debt / (collateral * 0.86)
      // = 80 / (100 * 0.86) = 80 / 86 = 0.9302
      mockUseMorphoCollateral.mockReturnValue(mockCollateral('100') as any)
      mockUseBorrowerDebt.mockReturnValue(mockDebt('80') as any)
      mockUseOraclePrice.mockReturnValue(mockOracle('1.0') as any)

      const { result } = renderHook(() => useLoanHealth('0x123' as `0x${string}`, { lltv: 0.86 }))

      expect(result.current.liquidationPrice).toBeCloseTo(0.9302, 3)
    })
  })
})
