/**
 * @jest-environment jsdom
 */

import { formatError } from './errors'

describe('formatError', () => {
  describe('User rejection errors', () => {
    it('should format "user rejected" error', () => {
      const err = new Error('user rejected transaction')
      expect(formatError(err)).toBe('Transaction cancelled by user')
    })

    it('should format "User rejected" error (capitalized)', () => {
      const err = new Error('User rejected the request')
      expect(formatError(err)).toBe('Transaction cancelled by user')
    })

    it('should format "User denied" error', () => {
      const err = new Error('User denied transaction signature')
      expect(formatError(err)).toBe('Transaction cancelled by user')
    })

    it('should format "ACTION_REJECTED" error', () => {
      const err = new Error('ACTION_REJECTED')
      expect(formatError(err)).toBe('Transaction cancelled by user')
    })
  })

  describe('Insufficient funds errors', () => {
    it('should format "insufficient funds" error', () => {
      const err = new Error('insufficient funds for gas')
      expect(formatError(err)).toBe('Insufficient funds for this transaction')
    })

    it('should format insufficient funds in longer message', () => {
      const err = new Error('Transaction failed: insufficient funds for gas * price + value')
      expect(formatError(err)).toBe('Insufficient funds for this transaction')
    })
  })

  describe('Network errors', () => {
    it('should format "network error" error', () => {
      const err = new Error('network error occurred')
      expect(formatError(err)).toBe('Network error. Please check your connection and try again.')
    })

    it('should format "failed to fetch" error', () => {
      const err = new Error('failed to fetch data from RPC')
      expect(formatError(err)).toBe('Network error. Please check your connection and try again.')
    })
  })

  describe('Timeout errors', () => {
    it('should format "timeout" error', () => {
      const err = new Error('Request timeout after 30s')
      expect(formatError(err)).toBe('Transaction timed out. Please try again.')
    })

    it('should format "exceeded" error', () => {
      const err = new Error('Rate limit exceeded')
      expect(formatError(err)).toBe('Transaction timed out. Please try again.')
    })
  })

  describe('Null/undefined handling', () => {
    it('should handle null gracefully', () => {
      expect(formatError(null)).toBe('Transaction failed')
    })

    it('should handle undefined gracefully', () => {
      expect(formatError(undefined)).toBe('Transaction failed')
    })
  })

  describe('Unknown errors', () => {
    it('should return generic message for unrecognized errors in production', () => {
      // Backup and mock NODE_ENV
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const err = new Error('Some obscure viem error with stack trace')
      expect(formatError(err)).toBe('Transaction failed. Please try again.')

      // Restore
      process.env.NODE_ENV = originalEnv
    })

    it('should handle non-Error objects', () => {
      // Backup and mock NODE_ENV
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      expect(formatError('string error')).toBe('Transaction failed. Please try again.')
      expect(formatError({ message: 'object error' })).toBe('Transaction failed. Please try again.')

      // Restore
      process.env.NODE_ENV = originalEnv
    })
  })
})
