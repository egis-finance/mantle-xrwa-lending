/**
 * @jest-environment jsdom
 */

import type { BorrowerPosition } from './useLiquidationRadar'

// Test the risk level classification logic used in useLiquidationRadar
// The actual hook uses these thresholds: < 1.0 = liquidatable, < 1.1 = danger, < 1.25 = warning, else = safe
describe('useLiquidationRadar risk levels', () => {
  // Helper function that mirrors the hook's risk level logic
  function getRiskLevel(healthFactor: number | null): BorrowerPosition['riskLevel'] {
    if (healthFactor === null) return 'safe'
    if (healthFactor < 1.0) return 'liquidatable'
    if (healthFactor < 1.1) return 'danger'
    if (healthFactor < 1.25) return 'warning'
    return 'safe'
  }

  describe('Risk level classification', () => {
    it('should return "liquidatable" for health factor < 1.0', () => {
      expect(getRiskLevel(0.5)).toBe('liquidatable')
      expect(getRiskLevel(0.95)).toBe('liquidatable')
      expect(getRiskLevel(0.99)).toBe('liquidatable')
    })

    it('should return "danger" for health factor 1.0 <= HF < 1.1', () => {
      expect(getRiskLevel(1.0)).toBe('danger')
      expect(getRiskLevel(1.05)).toBe('danger')
      expect(getRiskLevel(1.09)).toBe('danger')
    })

    it('should return "warning" for health factor 1.1 <= HF < 1.25', () => {
      expect(getRiskLevel(1.1)).toBe('warning')
      expect(getRiskLevel(1.15)).toBe('warning')
      expect(getRiskLevel(1.24)).toBe('warning')
    })

    it('should return "safe" for health factor >= 1.25', () => {
      expect(getRiskLevel(1.25)).toBe('safe')
      expect(getRiskLevel(1.5)).toBe('safe')
      expect(getRiskLevel(2.0)).toBe('safe')
      expect(getRiskLevel(10.0)).toBe('safe')
    })

    it('should return "safe" for null health factor (no debt)', () => {
      expect(getRiskLevel(null)).toBe('safe')
    })
  })

  describe('Health factor calculation', () => {
    // HF = (Collateral * OraclePrice * LLTV) / Debt
    function calculateHealthFactor(
      collateralValue: number,
      debtValue: number,
      lltv: number
    ): number | null {
      if (debtValue === 0) return null
      return (collateralValue * lltv) / debtValue
    }

    it('should calculate correct health factor for typical position', () => {
      // 100 USDY collateral * $1.05 price * 0.86 LLTV / $50 debt = 1.806
      const hf = calculateHealthFactor(105, 50, 0.86)
      expect(hf).toBeCloseTo(1.806, 2)
    })

    it('should return null for zero debt', () => {
      const hf = calculateHealthFactor(100, 0, 0.86)
      expect(hf).toBeNull()
    })

    it('should return liquidatable HF for over-leveraged position', () => {
      // $100 collateral * 0.86 LLTV / $90 debt = 0.955
      const hf = calculateHealthFactor(100, 90, 0.86)
      expect(hf).toBeCloseTo(0.955, 2)
      expect(getRiskLevel(hf)).toBe('liquidatable')
    })

    it('should return danger HF for position at LLTV threshold', () => {
      // $100 collateral * 0.86 LLTV / $86 debt = 1.0
      const hf = calculateHealthFactor(100, 86, 0.86)
      expect(hf).toBeCloseTo(1.0, 2)
      expect(getRiskLevel(hf)).toBe('danger')
    })

    it('should handle different LLTV values', () => {
      // With 75% LLTV: $100 * 0.75 / $70 = 1.071
      const hf75 = calculateHealthFactor(100, 70, 0.75)
      expect(hf75).toBeCloseTo(1.071, 2)
      expect(getRiskLevel(hf75)).toBe('danger')

      // With 86% LLTV: $100 * 0.86 / $70 = 1.229
      const hf86 = calculateHealthFactor(100, 70, 0.86)
      expect(hf86).toBeCloseTo(1.229, 2)
      expect(getRiskLevel(hf86)).toBe('warning')
    })
  })

  describe('Shares to assets conversion (floor - legacy)', () => {
    // debtAmount = (borrowShares * totalBorrowAssets) / totalBorrowShares
    function sharesToAssets(
      borrowShares: bigint,
      totalBorrowAssets: bigint,
      totalBorrowShares: bigint
    ): bigint {
      if (totalBorrowShares === 0n) return borrowShares
      return (borrowShares * totalBorrowAssets) / totalBorrowShares
    }

    it('should convert shares to assets correctly', () => {
      // 1000 shares, 10000 total assets, 5000 total shares = 2000 assets
      const assets = sharesToAssets(1000n, 10000n, 5000n)
      expect(assets).toBe(2000n)
    })

    it('should handle 1:1 ratio', () => {
      const assets = sharesToAssets(1000n, 1000n, 1000n)
      expect(assets).toBe(1000n)
    })

    it('should fallback to shares if totalShares is zero', () => {
      const assets = sharesToAssets(1000n, 0n, 0n)
      expect(assets).toBe(1000n)
    })

    it('should handle accrued interest (assets > shares)', () => {
      // Interest has accrued: 5000 shares, 5500 assets, 5000 total shares
      // User owns all shares, so gets all 5500 assets
      const assets = sharesToAssets(5000n, 5500n, 5000n)
      expect(assets).toBe(5500n)
    })
  })

  describe('Shares to assets conversion (ceiling - matches Morpho toAssetsUp)', () => {
    // ceil(a * b / c) = (a * b + c - 1) / c
    // This matches Morpho's SharesMathLib.toAssetsUp for debt calculations
    function sharesToAssetsUp(
      borrowShares: bigint,
      totalBorrowAssets: bigint,
      totalBorrowShares: bigint
    ): bigint {
      if (totalBorrowShares === 0n) return borrowShares
      return (borrowShares * totalBorrowAssets + totalBorrowShares - 1n) / totalBorrowShares
    }

    it('should convert shares to assets with ceiling rounding', () => {
      // 1000 shares, 10000 total assets, 5000 total shares = 2000 (exact)
      const assets = sharesToAssetsUp(1000n, 10000n, 5000n)
      expect(assets).toBe(2000n)
    })

    it('should round up when there is a remainder', () => {
      // 999 shares, 1001 total assets, 1000 total shares
      // Floor: 999 * 1001 / 1000 = 999
      // Ceiling: (999 * 1001 + 999) / 1000 = 1000
      const floor = (999n * 1001n) / 1000n
      const ceiling = sharesToAssetsUp(999n, 1001n, 1000n)
      expect(floor).toBe(999n)
      expect(ceiling).toBe(1000n)
    })

    it('should match floor when division is exact', () => {
      // 500 shares, 1000 total assets, 1000 total shares = 500 exact
      const assets = sharesToAssetsUp(500n, 1000n, 1000n)
      expect(assets).toBe(500n)
    })

    it('should handle 1:1 ratio', () => {
      const assets = sharesToAssetsUp(1000n, 1000n, 1000n)
      expect(assets).toBe(1000n)
    })

    it('should fallback to shares if totalShares is zero', () => {
      const assets = sharesToAssetsUp(1000n, 0n, 0n)
      expect(assets).toBe(1000n)
    })

    it('should handle small remainders correctly', () => {
      // Verify ceiling rounds up even for tiny remainders
      // 1 share, 3 total assets, 2 total shares
      // Floor: 1 * 3 / 2 = 1
      // Ceiling: (1 * 3 + 1) / 2 = 2
      const floor = (1n * 3n) / 2n
      const ceiling = sharesToAssetsUp(1n, 3n, 2n)
      expect(floor).toBe(1n)
      expect(ceiling).toBe(2n)
    })

    it('should handle large values without overflow', () => {
      // Realistic Morpho values: 10B USDC in 6 decimals
      const borrowShares = 5_000_000_000_000000n // 5B shares
      const totalBorrowAssets = 10_000_000_001_000000n // 10B + 1 USDC (interest accrued)
      const totalBorrowShares = 10_000_000_000_000000n // 10B total shares

      const assets = sharesToAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)
      // Should be slightly more than 5B due to interest
      expect(assets).toBeGreaterThan(5_000_000_000_000000n)
    })
  })
})
