/**
 * @jest-environment jsdom
 */

import type { BorrowerPosition } from './useLiquidationRadar'
import { parseOptionalBigInt } from './useLiquidationRadar'

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

describe('parseOptionalBigInt', () => {
  it('should parse valid positive bigint strings', () => {
    expect(parseOptionalBigInt('123')).toBe(123n)
    expect(parseOptionalBigInt('0')).toBe(0n)
    expect(parseOptionalBigInt('1000000')).toBe(1000000n)
  })

  it('should parse very large block numbers', () => {
    // Realistic Mantle block numbers
    expect(parseOptionalBigInt('85000000')).toBe(85000000n)
    expect(parseOptionalBigInt('2000000')).toBe(2000000n)
  })

  it('should return null for undefined/empty values', () => {
    expect(parseOptionalBigInt(undefined)).toBeNull()
    expect(parseOptionalBigInt('')).toBeNull()
  })

  it('should return null for invalid strings', () => {
    expect(parseOptionalBigInt('abc')).toBeNull()
    expect(parseOptionalBigInt('12.34')).toBeNull()
    expect(parseOptionalBigInt('not a number')).toBeNull()
  })

  it('should accept hex strings (BigInt supports 0x prefix)', () => {
    // BigInt() does support hex, which is fine for block numbers
    expect(parseOptionalBigInt('0x1234')).toBe(0x1234n)
  })

  it('should return null for negative values', () => {
    expect(parseOptionalBigInt('-1')).toBeNull()
    expect(parseOptionalBigInt('-100')).toBeNull()
  })
})

describe('BorrowersCache with lastScannedBlock', () => {
  const CACHE_KEY = 'egis-borrowers-test'

  beforeEach(() => {
    localStorage.clear()
  })

  it('should serialize and deserialize cache with lastScannedBlock', () => {
    const cache = {
      borrowers: ['0x1234567890123456789012345678901234567890' as `0x${string}`],
      timestamp: Date.now(),
      lastScannedBlock: '85000000',
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))

    const retrieved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    expect(retrieved.lastScannedBlock).toBe('85000000')
    expect(parseOptionalBigInt(retrieved.lastScannedBlock)).toBe(85000000n)
  })

  it('should handle cache without lastScannedBlock (legacy format)', () => {
    const legacyCache = {
      borrowers: ['0x1234567890123456789012345678901234567890'],
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(legacyCache))

    const retrieved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    expect(retrieved.lastScannedBlock).toBeUndefined()
    expect(parseOptionalBigInt(retrieved.lastScannedBlock)).toBeNull()
  })

  it('should accumulate borrowers across scans', () => {
    // Simulate first scan
    const firstScan = {
      borrowers: ['0xAAA0000000000000000000000000000000000001'],
      timestamp: Date.now(),
      lastScannedBlock: '1000',
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(firstScan))

    // Simulate second scan that discovers new borrower
    const existingCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    const allBorrowers = new Set(existingCache.borrowers)
    allBorrowers.add('0xBBB0000000000000000000000000000000000002')

    const secondScan = {
      borrowers: Array.from(allBorrowers),
      timestamp: Date.now(),
      lastScannedBlock: '2000',
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(secondScan))

    const final = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    expect(final.borrowers).toHaveLength(2)
    expect(final.lastScannedBlock).toBe('2000')
  })
})

describe('Chunked log scanning logic', () => {
  // Test the chunking boundary calculations used in scanLockedBorrowers
  const CHUNK_SIZE = 50000n

  function calculateChunks(fromBlock: bigint, toBlock: bigint): Array<{ from: bigint; to: bigint }> {
    const chunks: Array<{ from: bigint; to: bigint }> = []
    if (fromBlock > toBlock) return chunks

    let startBlock = fromBlock
    while (startBlock <= toBlock) {
      const endBlock = startBlock + CHUNK_SIZE - 1n
      const chunkToBlock = endBlock > toBlock ? toBlock : endBlock
      chunks.push({ from: startBlock, to: chunkToBlock })
      startBlock = chunkToBlock + 1n
    }
    return chunks
  }

  it('should produce single chunk for range smaller than chunk size', () => {
    const chunks = calculateChunks(1000n, 10000n)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ from: 1000n, to: 10000n })
  })

  it('should produce multiple chunks for large ranges', () => {
    // 100k blocks = 2 chunks of 50k each
    const chunks = calculateChunks(0n, 99999n)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual({ from: 0n, to: 49999n })
    expect(chunks[1]).toEqual({ from: 50000n, to: 99999n })
  })

  it('should handle exact chunk boundary', () => {
    // Exactly 50k blocks = 1 chunk
    const chunks = calculateChunks(0n, 49999n)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ from: 0n, to: 49999n })
  })

  it('should return empty array when fromBlock > toBlock', () => {
    const chunks = calculateChunks(1000n, 500n)
    expect(chunks).toHaveLength(0)
  })

  it('should handle single block range', () => {
    const chunks = calculateChunks(5000n, 5000n)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ from: 5000n, to: 5000n })
  })

  it('should correctly chunk realistic 2M block range', () => {
    // 2M blocks at 50k chunks = 40 chunks
    const chunks = calculateChunks(0n, 1999999n)
    expect(chunks).toHaveLength(40)
    expect(chunks[0].from).toBe(0n)
    expect(chunks[39].to).toBe(1999999n)
  })
})
