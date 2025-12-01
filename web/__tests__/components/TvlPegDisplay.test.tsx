/**
 * Component tests for TvlPegDisplay
 */

import { render, screen } from '@testing-library/react'
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
    })

    render(<TvlPegDisplay />)

    expect(screen.getAllByText('$25.00M')).toHaveLength(2)
    expect(screen.getByText('System Balanced')).toBeInTheDocument()
    expect(screen.getByText('Mantle')).toBeInTheDocument()
    expect(screen.getByText('Eth')).toBeInTheDocument()
  })

  it('shows warning on peg deviation', () => {
    mockUseTvlPeg.mockReturnValue({
      mantle: { value: '25000000', isLoading: false, isError: false },
      ethereum: { value: '20000000', isLoading: false, isError: false },
      isLoading: false,
      isError: false,
      isBalanced: false,
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
    })

    render(<TvlPegDisplay />)

    expect(screen.getAllByText('$0.00')).toHaveLength(2)
    expect(screen.getByText('System Balanced')).toBeInTheDocument()
  })
})
