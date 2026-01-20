/**
 * Unit tests for useTvlPeg hook
 */

import { renderHook } from '@testing-library/react'
import { useTvlPeg } from '@/hooks/useTvlPeg'

const mockUseCrossChainRead = jest.fn()

jest.mock('@/lib/swr/useCrossChainRead', () => ({
  useCrossChainRead: (...args: unknown[]) => mockUseCrossChainRead(...args),
}))

jest.mock('@/lib/contracts', () => ({
  contracts: {
    collateralLocker: { address: '0xCollateralLocker', chainId: 15000 },
    acUSDY: { address: '0xAcUSDY', chainId: 10001 },
  },
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
    mockUseCrossChainRead.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.mantle.value).toBeNull()
    expect(result.current.ethereum.value).toBeNull()
    expect(result.current.isBalanced).toBeNull()
  })

  it('returns balanced state when values match', () => {
    const mockValue = BigInt('25000000000000000000000000') // 25M with 18 decimals

    mockUseCrossChainRead.mockReturnValue({
      data: { mantle: mockValue, ethereum: mockValue },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
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

    mockUseCrossChainRead.mockReturnValue({
      data: { mantle: mantleValue, ethereum: ethValue },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isBalanced).toBe(false)
  })

  it('returns balanced when both values are zero', () => {
    mockUseCrossChainRead.mockReturnValue({
      data: { mantle: BigInt(0), ethereum: BigInt(0) },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isBalanced).toBe(true)
    expect(result.current.mantle.value).toBe('0')
    expect(result.current.ethereum.value).toBe('0')
  })

  it('handles error state gracefully', () => {
    mockUseCrossChainRead.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('RPC error'),
      refetch: jest.fn(),
      isRefetching: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isError).toBe(true)
    expect(result.current.mantle.value).toBeNull()
    expect(result.current.ethereum.value).toBeNull()
  })

  it('passes correct contract configurations', () => {
    mockUseCrossChainRead.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    })

    renderHook(() => useTvlPeg())

    expect(mockUseCrossChainRead).toHaveBeenCalledWith(
      expect.objectContaining({
        mantleContract: expect.objectContaining({
          address: '0xCollateralLocker',
          functionName: 'getTotalLocked',
        }),
        ethereumContract: expect.objectContaining({
          address: '0xAcUSDY',
          functionName: 'totalSupply',
        }),
        enabled: true,
      })
    )
  })

  it('handles tolerance for small differences (within 0.01%)', () => {
    const mantleValue = BigInt('25000000000000000000000000') // 25M
    // 25M * 0.00005 = 1250 difference (within 0.01% tolerance)
    const ethValue = BigInt('24999000000000000000000000') // 24.999M

    mockUseCrossChainRead.mockReturnValue({
      data: { mantle: mantleValue, ethereum: ethValue },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    })

    const { result } = renderHook(() => useTvlPeg())

    // 0.004% difference should still be within tolerance
    expect(result.current.isBalanced).toBe(true)
  })

  it('exposes refetch function', () => {
    const mockRefetch = jest.fn()
    mockUseCrossChainRead.mockReturnValue({
      data: { mantle: BigInt(0), ethereum: BigInt(0) },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: mockRefetch,
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.refetch).toBe(mockRefetch)
  })

  it('returns isRefetching when refetching', () => {
    mockUseCrossChainRead.mockReturnValue({
      data: { mantle: BigInt(0), ethereum: BigInt(0) },
      isLoading: false,
      isError: false,
      isRefetching: true,
      refetch: jest.fn(),
    })

    const { result } = renderHook(() => useTvlPeg())

    expect(result.current.isRefetching).toBe(true)
  })
})
