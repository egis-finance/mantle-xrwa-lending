/**
 * Component tests for TvlPegDisplay
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { TvlPegDisplay } from '@/components/TvlPegDisplay'

const mockUseTvlPeg = jest.fn()

jest.mock('@/hooks/useTvlPeg', () => ({
  useTvlPeg: () => mockUseTvlPeg(),
}))

describe('TvlPegDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows loading state with placeholder values', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: null, isLoading: true, isError: false },
      ethereum: { value: null, isLoading: true, isError: false },
      isLoading: true,
      isError: false,
      isBalanced: null,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    // Loading shows "..." placeholders for total + both chain values
    expect(screen.getAllByText('...')).toHaveLength(3)
  })

  it('shows balanced state with correct values', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '25000000', isLoading: false, isError: false },
      ethereum: { value: '25000000', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: true,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    // Total TVL shows $50M (25M + 25M)
    expect(screen.getByText('$50.00M')).toBeInTheDocument()
    // Individual chain values each show $25M
    expect(screen.getAllByText('$25.00M')).toHaveLength(2)
    // Chain-specific labels
    expect(screen.getByText('Locked USDY')).toBeInTheDocument()
    expect(screen.getByText('AcUSDY Supply')).toBeInTheDocument()
  })

  it('shows different chain values correctly', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '25000000', isLoading: false, isError: false },
      ethereum: { value: '20000000', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    // Total TVL shows $45M (25M + 20M)
    expect(screen.getByText('$45.00M')).toBeInTheDocument()
    expect(screen.getByText('$25.00M')).toBeInTheDocument()
    expect(screen.getByText('$20.00M')).toBeInTheDocument()
  })

  it('shows header title', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '0', isLoading: false, isError: false },
      ethereum: { value: '0', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: true,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    expect(screen.getByText('Protocol TVL')).toBeInTheDocument()
  })

  it('handles zero values correctly', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '0', isLoading: false, isError: false },
      ethereum: { value: '0', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: true,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    // Total + both chain values show $0.00
    expect(screen.getAllByText('$0.00')).toHaveLength(3)
  })

  it('calls refetch when refresh button is clicked', () => {
    const mockRefetch = jest.fn()
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '10000000', isLoading: false, isError: false },
      ethereum: { value: '10000000', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: true,
      isRefetching: false,
      refetch: mockRefetch,
    })

    render(<TvlPegDisplay />)

    // Find the refresh button by its icon
    const refreshButton = screen.getByRole('button')
    fireEvent.click(refreshButton)

    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('disables refresh button during loading', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: null, isLoading: true, isError: false },
      ethereum: { value: null, isLoading: true, isError: false },
      isLoading: true,
      isError: false,
      isBalanced: null,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    const refreshButton = screen.getByRole('button')
    expect(refreshButton).toBeDisabled()
  })

  it('disables refresh button during refetching', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '10000000', isLoading: false, isError: false },
      ethereum: { value: '10000000', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: true,
      isRefetching: true,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    const refreshButton = screen.getByRole('button')
    expect(refreshButton).toBeDisabled()
  })

  it('shows spinning animation during refetch', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '10000000', isLoading: false, isError: false },
      ethereum: { value: '10000000', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: true,
      isRefetching: true,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    const refreshButton = screen.getByRole('button')
    const icon = refreshButton.querySelector('svg')
    expect(icon).toHaveClass('animate-spin')
  })

  it('shows chain labels', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '10000000', isLoading: false, isError: false },
      ethereum: { value: '10000000', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: true,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    expect(screen.getByText('Mantle')).toBeInTheDocument()
    expect(screen.getByText('Ethereum')).toBeInTheDocument()
  })
})
