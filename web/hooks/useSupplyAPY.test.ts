/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import {
  useSupplyAPY,
  calculateSupplyAPY,
  approximateBorrowRate,
  formatApy,
} from './useSupplyAPY'

describe('useSupplyAPY', () => {
  describe('formatApy', () => {
    it('returns null for null input', () => {
      expect(formatApy(null)).toBeNull()
    })

    it('returns "0.00%" for zero APY', () => {
      expect(formatApy(0)).toBe('0.00%')
    })

    it('returns "0.00%" for negative APY', () => {
      expect(formatApy(-0.001)).toBe('0.00%')
    })

    it('returns "<0.01%" for very small positive APY', () => {
      // 0.00005 = 0.005% which is less than 0.01%
      expect(formatApy(0.00005)).toBe('<0.01%')
      expect(formatApy(0.00001)).toBe('<0.01%')
      expect(formatApy(0.00009)).toBe('<0.01%')
    })

    it('returns formatted percentage for normal APY values', () => {
      expect(formatApy(0.05)).toBe('5.00%')
      expect(formatApy(0.0142)).toBe('1.42%')
      expect(formatApy(0.1)).toBe('10.00%')
    })

    it('handles boundary at 0.01%', () => {
      // Exactly 0.01% should show as "0.01%", not "<0.01%"
      expect(formatApy(0.0001)).toBe('0.01%')
    })
  })

  describe('approximateBorrowRate', () => {
    it('returns BASE_RATE (1%) at 0% utilization', () => {
      expect(approximateBorrowRate(0)).toBeCloseTo(0.01, 4)
    })

    it('returns BASE_RATE for negative utilization', () => {
      expect(approximateBorrowRate(-0.1)).toBeCloseTo(0.01, 4)
    })

    it('returns TARGET_RATE (4%) at 90% utilization', () => {
      expect(approximateBorrowRate(0.9)).toBeCloseTo(0.04, 4)
    })

    it('returns MAX_RATE (100%) at 100% utilization', () => {
      expect(approximateBorrowRate(1.0)).toBeCloseTo(1.0, 4)
    })

    it('returns MAX_RATE for utilization above 100%', () => {
      expect(approximateBorrowRate(1.5)).toBeCloseTo(1.0, 4)
    })

    it('interpolates linearly below target utilization', () => {
      // At 45% utilization (halfway to 90%), rate should be ~2.5%
      // BASE_RATE + (0.45/0.9) * (TARGET_RATE - BASE_RATE)
      // 0.01 + 0.5 * 0.03 = 0.025
      expect(approximateBorrowRate(0.45)).toBeCloseTo(0.025, 4)
    })

    it('increases steeply above target utilization', () => {
      // At 95% utilization (halfway from 90% to 100%)
      // excess = (0.95 - 0.9) / (1 - 0.9) = 0.5
      // TARGET_RATE + 0.5 * (MAX_RATE - TARGET_RATE) = 0.04 + 0.5 * 0.96 = 0.52
      expect(approximateBorrowRate(0.95)).toBeCloseTo(0.52, 4)
    })
  })

  describe('calculateSupplyAPY', () => {
    it('returns 0 at 0% utilization', () => {
      // borrowRate * 0 * (1 - fee) = 0
      expect(calculateSupplyAPY(0, 0)).toBe(0)
      expect(calculateSupplyAPY(0, 0.1)).toBe(0)
    })

    it('calculates APY correctly at low utilization', () => {
      // At 0.1% utilization (user's scenario), fee = 0
      // utilization = 0.001
      // borrowRate ≈ 0.01 + (0.001/0.9) * 0.03 ≈ 0.010033
      // APY = 0.010033 * 0.001 * 1 ≈ 0.00001
      const apy = calculateSupplyAPY(0.1, 0)
      expect(apy).toBeGreaterThan(0)
      expect(apy).toBeLessThan(0.0001) // Less than 0.01%
    })

    it('calculates APY at moderate utilization', () => {
      // At 50% utilization, fee = 0
      // utilization = 0.5
      // borrowRate ≈ 0.01 + (0.5/0.9) * 0.03 ≈ 0.0267
      // APY = 0.0267 * 0.5 * 1 ≈ 0.0133 (1.33%)
      const apy = calculateSupplyAPY(50, 0)
      expect(apy).toBeCloseTo(0.0133, 3)
    })

    it('reduces APY by protocol fee', () => {
      // With 10% fee, APY should be 90% of the no-fee APY
      const apyNoFee = calculateSupplyAPY(50, 0)
      const apyWithFee = calculateSupplyAPY(50, 0.1)
      expect(apyWithFee).toBeCloseTo(apyNoFee * 0.9, 6)
    })

    it('calculates high APY at high utilization', () => {
      // At 95% utilization, fee = 0
      // borrowRate ≈ 0.52 (steep curve)
      // APY = 0.52 * 0.95 * 1 ≈ 0.494 (49.4%)
      const apy = calculateSupplyAPY(95, 0)
      expect(apy).toBeCloseTo(0.494, 2)
    })
  })

  describe('useSupplyAPY hook', () => {
    it('returns loading state when isLoading is true', () => {
      const { result } = renderHook(() =>
        useSupplyAPY({ utilizationRate: 50, fee: 0, isLoading: true })
      )

      expect(result.current.isLoading).toBe(true)
      expect(result.current.apy).toBeNull()
      expect(result.current.apyFormatted).toBeNull()
      expect(result.current.borrowRate).toBeNull()
    })

    it('returns loading state when utilizationRate is null', () => {
      const { result } = renderHook(() =>
        useSupplyAPY({ utilizationRate: null, fee: 0, isLoading: false })
      )

      expect(result.current.isLoading).toBe(false)
      expect(result.current.apy).toBeNull()
    })

    it('returns loading state when fee is null', () => {
      const { result } = renderHook(() =>
        useSupplyAPY({ utilizationRate: 50, fee: null, isLoading: false })
      )

      expect(result.current.apy).toBeNull()
    })

    it('calculates APY correctly with valid params', () => {
      const { result } = renderHook(() =>
        useSupplyAPY({ utilizationRate: 50, fee: 0.1, isLoading: false })
      )

      expect(result.current.isLoading).toBe(false)
      expect(result.current.apy).toBeGreaterThan(0)
      expect(result.current.borrowRate).toBeGreaterThan(0)
      expect(result.current.apyFormatted).toMatch(/^\d+\.\d{2}%$/)
    })

    it('formats very small APY as "<0.01%"', () => {
      // 0.1% utilization produces very small APY
      const { result } = renderHook(() =>
        useSupplyAPY({ utilizationRate: 0.1, fee: 0, isLoading: false })
      )

      expect(result.current.apyFormatted).toBe('<0.01%')
    })

    it('handles zero utilization', () => {
      const { result } = renderHook(() =>
        useSupplyAPY({ utilizationRate: 0, fee: 0, isLoading: false })
      )

      expect(result.current.apy).toBe(0)
      expect(result.current.apyFormatted).toBe('0.00%')
    })
  })
})
