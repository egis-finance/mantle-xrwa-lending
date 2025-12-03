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

  it('shows loading state', () => {
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

    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(screen.getAllByText('...')).toHaveLength(2)
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

    expect(screen.getAllByText('$25.00M')).toHaveLength(2)
    expect(screen.getByText('System Balanced')).toBeInTheDocument()
    expect(screen.getByText('USDY')).toBeInTheDocument()
    expect(screen.getByText('AcUSDY')).toBeInTheDocument()
    expect(screen.getByText(/on Mantle/)).toBeInTheDocument()
    expect(screen.getByText(/on Eth/)).toBeInTheDocument()
  })

  it('shows warning on peg deviation', () => {
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

    expect(screen.getByText('$25.00M')).toBeInTheDocument()
    expect(screen.getByText('$20.00M')).toBeInTheDocument()
    expect(screen.getByText('Peg Deviation')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: null, isLoading: false, isError: true },
      ethereum: { value: null, isLoading: false, isError: true },
      isLoading: false,
      isError: true,
      isBalanced: null,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<TvlPegDisplay />)

    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('renders data-testid attributes for E2E testing', () => {
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

    const mantleEl = screen.getByTestId('mantle-tvl')
    const ethEl = screen.getByTestId('eth-tvl')

    expect(mantleEl).toHaveAttribute('data-value', '10000000')
    expect(ethEl).toHaveAttribute('data-value', '10000000')
  })

  it('shows Cross-Chain TVL Peg label', () => {
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

    expect(screen.getByText('Cross-Chain TVL Peg')).toBeInTheDocument()
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

    expect(screen.getAllByText('$0.00')).toHaveLength(2)
    expect(screen.getByText('System Balanced')).toBeInTheDocument()
  })

  it('renders refresh button with correct aria-label', () => {
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

    const refreshButton = screen.getByTestId('refresh-tvl')
    expect(refreshButton).toHaveAttribute('aria-label', 'Refresh TVL data')
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

    const refreshButton = screen.getByTestId('refresh-tvl')
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

    const refreshButton = screen.getByTestId('refresh-tvl')
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

    const refreshButton = screen.getByTestId('refresh-tvl')
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

    const refreshButton = screen.getByTestId('refresh-tvl')
    const icon = refreshButton.querySelector('svg')
    expect(icon).toHaveClass('animate-spin')
  })
})
