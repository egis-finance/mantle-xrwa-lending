/**
 * Unit tests for formatTvl utility
 */

import { formatTvl } from '@/lib/format'

describe('formatTvl', () => {
  it('returns "--" for null value', () => {
    expect(formatTvl(null)).toBe('--')
  })

  it('returns "--" for NaN value', () => {
    expect(formatTvl('not-a-number')).toBe('--')
  })

  it('formats millions correctly', () => {
    expect(formatTvl('25000000')).toBe('$25.00M')
    expect(formatTvl('1500000')).toBe('$1.50M')
    expect(formatTvl('1000000')).toBe('$1.00M')
  })

  it('formats thousands correctly', () => {
    expect(formatTvl('500000')).toBe('$500.00K')
    expect(formatTvl('1000')).toBe('$1.00K')
    expect(formatTvl('999999')).toBe('$1000.00K')
  })

  it('formats small values correctly', () => {
    expect(formatTvl('500')).toBe('$500.00')
    expect(formatTvl('0')).toBe('$0.00')
    expect(formatTvl('0.5')).toBe('$0.50')
  })

  it('handles decimal precision for millions', () => {
    expect(formatTvl('25123456.789')).toBe('$25.12M')
    expect(formatTvl('25999999')).toBe('$26.00M')
  })

  it('handles decimal precision for thousands', () => {
    expect(formatTvl('123456.789')).toBe('$123.46K')
  })

  it('handles negative values (edge case - TVL should not be negative)', () => {
    // Negative TVL is an edge case that shouldn't occur in practice
    // The function doesn't specially handle it - small negatives show as dollars
    expect(formatTvl('-500')).toBe('$-500.00')
  })

  it('handles billion values', () => {
    expect(formatTvl('1000000000')).toBe('$1.00B')
    expect(formatTvl('5500000000')).toBe('$5.50B')
  })

  it('handles trillion values', () => {
    expect(formatTvl('1000000000000')).toBe('$1.00T')
    expect(formatTvl('2500000000000')).toBe('$2.50T')
  })

  it('handles empty string', () => {
    expect(formatTvl('')).toBe('--')
  })
})
