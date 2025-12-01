/**
 * Unit tests for useTvlPeg hook
 */

import { renderHook } from '@testing-library/react'
import { useTvlPeg } from '@/hooks/useTvlPeg'

const mockUseReadContract = jest.fn()

jest.mock('wagmi', () => ({
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
}))

jest.mock('viem', () => ({
  formatUnits: (value: bigint, decimals: number) => {
    return (Number(value) / Math.pow(10, decimals)).toString()
  },
}))

describe('useTvlPeg', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns loading state initially', () => {
    mockUseReadContract.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.mantle.value).toBeNull()
    expect(result.current.ethereum.value).toBeNull()
    expect(result.current.isBalanced).toBeNull()
  })

  it('returns balanced state when values match', () => {
    const mockValue = BigInt('25000000000000000000000000') // 25M with 18 decimals

    mockUseReadContract.mockReturnValue({
      data: mockValue,
      isLoading: false,
      isError: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isBalanced).toBe(true)
    expect(result.current.mantle.value).toBe('25000000')
    expect(result.current.ethereum.value).toBe('25000000')
  })

  it('returns unbalanced state when values differ significantly', () => {
    const mantleValue = BigInt('25000000000000000000000000') // 25M
    const ethValue = BigInt('20000000000000000000000000') // 20M

    mockUseReadContract
      .mockReturnValueOnce({ data: mantleValue, isLoading: false, isError: false })
      .mockReturnValueOnce({ data: ethValue, isLoading: false, isError: false })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isBalanced).toBe(false)
  })

  it('returns balanced when both values are zero', () => {
    mockUseReadContract.mockReturnValue({
      data: BigInt(0),
      isLoading: false,
      isError: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isBalanced).toBe(true)
    expect(result.current.mantle.value).toBe('0')
    expect(result.current.ethereum.value).toBe('0')
  })

  it('handles error state gracefully', () => {
    mockUseReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('RPC error'),
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isError).toBe(true)
    expect(result.current.mantle.value).toBeNull()
    expect(result.current.ethereum.value).toBeNull()
  })

  it('queries correct chain IDs', () => {
    mockUseReadContract.mockReturnValue({
      data: BigInt(0),
      isLoading: false,
      isError: false,
    })

    renderHook(() => useTvlPeg())

    // First call should be Mantle (chainId 15000)
    expect(mockUseReadContract.mock.calls[0][0]).toMatchObject({
      chainId: 15000,
      functionName: 'getTotalLocked',
    })

    // Second call should be Ethereum (chainId 10001)
    expect(mockUseReadContract.mock.calls[1][0]).toMatchObject({
      chainId: 10001,
      functionName: 'totalSupply',
    })
  })

  it('handles tolerance for small differences (within 0.01%)', () => {
    const mantleValue = BigInt('25000000000000000000000000') // 25M
    // 25M * 0.00005 = 1250 difference (within 0.01% tolerance)
    const ethValue = BigInt('24999000000000000000000000') // 24.999M

    mockUseReadContract
      .mockReturnValueOnce({ data: mantleValue, isLoading: false, isError: false })
      .mockReturnValueOnce({ data: ethValue, isLoading: false, isError: false })

    const { result } = renderHook(() => useTvlPeg())

    // 0.004% difference should still be within tolerance
    expect(result.current.isBalanced).toBe(true)
  })
})
