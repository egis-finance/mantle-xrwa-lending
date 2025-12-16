/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import BorrowPage from './page'
import { useDynamicWallet } from '@/hooks/useDynamicWallet'
import { useSDKReady } from '@/hooks/useSDKReady'
import { useMorphoCollateral } from '@/hooks/useMorphoCollateral'
import { useLockedUSDY } from '@/hooks/useLockedUSDY'
import { useBorrowerBalance } from '@/hooks/useBorrowerBalance'
import { useLoanHealth } from '@/hooks/useLoanHealth'
import { useSystemParams } from '@/hooks/useSystemParams'

// Mock all dependencies
jest.mock('@/hooks/useDynamicWallet')
jest.mock('@/hooks/useSDKReady')
jest.mock('@/hooks/useMorphoCollateral')
jest.mock('@/hooks/useLockedUSDY')
jest.mock('@/hooks/useBorrowerBalance')
jest.mock('@/hooks/useLoanHealth')
jest.mock('@/hooks/useSystemParams')
jest.mock('@/components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}))

const mockUseDynamicWallet = useDynamicWallet as jest.MockedFunction<typeof useDynamicWallet>
const mockUseSDKReady = useSDKReady as jest.MockedFunction<typeof useSDKReady>
const mockUseMorphoCollateral = useMorphoCollateral as jest.MockedFunction<typeof useMorphoCollateral>
const mockUseLockedUSDY = useLockedUSDY as jest.MockedFunction<typeof useLockedUSDY>
const mockUseBorrowerBalance = useBorrowerBalance as jest.MockedFunction<typeof useBorrowerBalance>
const mockUseLoanHealth = useLoanHealth as jest.MockedFunction<typeof useLoanHealth>
const mockUseSystemParams = useSystemParams as jest.MockedFunction<typeof useSystemParams>

// Minimal env config so BorrowPage doesn't show "App not configured".
process.env.NEXT_PUBLIC_MANTLE_LOCKER = '0x1111111111111111111111111111111111111111'
process.env.NEXT_PUBLIC_ETH_MORPHO = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'
process.env.NEXT_PUBLIC_MORPHO_MARKET_ID = '0x' + '11'.repeat(32)

describe('BorrowPage - Loan Health Component', () => {
  const mockRefetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    // Wallet connected by default
    mockUseSDKReady.mockReturnValue(true)
    mockUseDynamicWallet.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
      isReady: true,
      chainId: 1,
      publicClient: undefined,
      walletClient: undefined,
      connect: jest.fn(),
      switchNetwork: jest.fn(),
    })

    mockUseMorphoCollateral.mockReturnValue({
      value: '100',
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      data: undefined,
    })

    mockUseLockedUSDY.mockReturnValue({
      value: '1000',
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      data: undefined,
    })

    mockUseBorrowerBalance.mockReturnValue({
      value: '5000',
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      data: undefined,
    })

    // Mock useSystemParams with default LLTV (86%)
    mockUseSystemParams.mockReturnValue({
      lltv: 0.86,
      lltvPercentage: '86%',
      liquidationThreshold: 0.86,
      liquidationThresholdPercentage: '86%',
      liquidationBonus: 0.163,
      liquidationBonusPercentage: '16%',
      totalSupply: '1000000',
      totalBorrow: '500000',
      availableLiquidity: '500000',
      utilizationRate: 50,
      fee: 0,
      feePercentage: '0.00%',
      oraclePrice: '1.05',
      oracleAddress: '0x1234567890123456789012345678901234567890',
      oracleHaircutPercentage: 2,
      oracleIsStale: false,
      lastUpdate: Date.now(),
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    })
  })

  describe('Loading State', () => {
    it('should show loading skeleton when loan health is loading', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: null,
        debtValue: null,
        ltv: null,
        healthFactor: null,
        liquidationPrice: null,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: true,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Should show loading text
      expect(screen.getByText('Fetching blockchain data...')).toBeInTheDocument()
      
      // Should show loading animation elements
      const loadingElements = screen.getAllByRole('generic')
      expect(loadingElements.length).toBeGreaterThan(0)
    })
  })

  describe('Unavailable State', () => {
    it('should show connect placeholder when wallet is disconnected', () => {
      mockUseSDKReady.mockReturnValue(true)
      mockUseDynamicWallet.mockReturnValue({
        address: undefined,
        isConnected: false,
        isReady: false,
        chainId: undefined,
        publicClient: undefined,
        walletClient: undefined,
        connect: jest.fn(),
        switchNetwork: jest.fn(),
      })

      mockUseLoanHealth.mockReturnValue({
        collateralValue: null,
        debtValue: null,
        ltv: null,
        healthFactor: null,
        liquidationPrice: null,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      expect(screen.getByText('Connect wallet to view position')).toBeInTheDocument()
    })
  })

  describe('No Position State', () => {
    it('should display zero values when no position exists', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 0,
        debtValue: 0,
        ltv: 0,
        healthFactor: Infinity,
        liquidationPrice: 0,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

	      render(<BorrowPage />)

	      // Check for $0 values
	      expect(screen.getAllByText('$0')).toHaveLength(2)
	      expect(screen.getByText('0.0%')).toBeInTheDocument()
	    })
	  })

  describe('Safe Position', () => {
    it('should display safe position with green indicators', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 105000,
        debtValue: 50000,
        ltv: 47.6,
        healthFactor: 1.575,
        liquidationPrice: 0.634,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Check LTV display
      expect(screen.getByText('47.6%')).toBeInTheDocument()
      
      // Check values are displayed
      expect(screen.getByText('$105,000')).toBeInTheDocument()
      expect(screen.getByText('$50,000')).toBeInTheDocument()
      
      // Check health factor
      expect(screen.getByText('1.58')).toBeInTheDocument()
      
      // Should not show warning banners
      expect(screen.queryByText(/Critical/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Warning/i)).not.toBeInTheDocument()
    })
  })

  describe('Warning Position', () => {
    it('should display warning indicators for high LTV', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 70000,
        ltv: 70.0,
        healthFactor: 1.071,
        liquidationPrice: 0.933,
        isHealthy: true,
        riskLevel: 'warning',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Check for warning message
      expect(screen.getByText(/Warning: Approaching liquidation threshold/i)).toBeInTheDocument()
      
      // Check liquidation price is shown
      expect(screen.getByText(/Liquidation price: \$0\.9330/i)).toBeInTheDocument()
      
      // Check LTV
      expect(screen.getByText('70.0%')).toBeInTheDocument()
    })
  })

  describe('Danger Position', () => {
    it('should display critical warnings for dangerous LTV', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 76000,
        ltv: 76.0,
        healthFactor: 0.987,
        liquidationPrice: 1.013,
        isHealthy: false,
        riskLevel: 'danger',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Check for critical warning
      expect(screen.getByText(/Critical: Position at risk of liquidation!/i)).toBeInTheDocument()
      
      // Check liquidation price
      expect(screen.getByText(/Liquidation price: \$1\.0130/i)).toBeInTheDocument()
      
      // Check LTV
      expect(screen.getByText('76.0%')).toBeInTheDocument()
      
      // Check health factor
      expect(screen.getByText('0.99')).toBeInTheDocument()
    })
  })

  describe('Health Factor Display', () => {
    it('should show health factor when there is debt', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 50000,
        ltv: 50.0,
        healthFactor: 1.5,
        liquidationPrice: 0.667,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Should show Health Factor label
      expect(screen.getByText('Health Factor:')).toBeInTheDocument()
      expect(screen.getByText('1.50')).toBeInTheDocument()
    })

    it('should not show health factor section when no debt', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 0,
        ltv: 0,
        healthFactor: Infinity,
        liquidationPrice: 0,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Health factor section should not be rendered
      expect(screen.queryByText('Health Factor:')).not.toBeInTheDocument()
    })

    it('should display infinity symbol for infinite health factor', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 0.01, // Very small debt
        ltv: 0.01,
        healthFactor: Infinity,
        liquidationPrice: 0,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      expect(screen.getByText('∞')).toBeInTheDocument()
    })
  })

  describe('Component Structure', () => {
    it('should render the loan health card', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 50000,
        ltv: 50.0,
        healthFactor: 1.5,
        liquidationPrice: 0.667,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Check for main sections
      expect(screen.getByText('Loan Health')).toBeInTheDocument()
      expect(screen.getByText('Current LTV')).toBeInTheDocument()
      expect(screen.getByText('Collateral Value')).toBeInTheDocument()
      expect(screen.getByText('Total Debt')).toBeInTheDocument()
    })

    it('should render other page components', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 0,
        debtValue: 0,
        ltv: 0,
        healthFactor: Infinity,
        liquidationPrice: 0,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Check that other page elements exist
      expect(screen.getByTestId('navbar')).toBeInTheDocument()
      expect(screen.getByText('Borrower Terminal')).toBeInTheDocument()
      expect(screen.getByText('Transaction Builder')).toBeInTheDocument()
    })
  })

  describe('Value Formatting', () => {
    it('should format large numbers with commas', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 1234567,
        debtValue: 987654,
        ltv: 79.9,
        healthFactor: 0.938,
        liquidationPrice: 1.067,
        isHealthy: false,
        riskLevel: 'danger',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Should format with commas (no decimals for large numbers)
      expect(screen.getByText('$1,234,567')).toBeInTheDocument()
      expect(screen.getByText('$987,654')).toBeInTheDocument()
    })

    it('should format LTV with one decimal place', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 47619,
        ltv: 47.619,
        healthFactor: 1.575,
        liquidationPrice: 0.635,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      // Should round to 1 decimal
      expect(screen.getByText('47.6%')).toBeInTheDocument()
    })

    it('should format health factor with two decimal places', () => {
      mockUseLoanHealth.mockReturnValue({
        collateralValue: 100000,
        debtValue: 50000,
        ltv: 50.0,
        healthFactor: 1.575,
        liquidationPrice: 0.667,
        isHealthy: true,
        riskLevel: 'safe',
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      })

      render(<BorrowPage />)

      expect(screen.getByText('1.58')).toBeInTheDocument()
    })
  })
})
