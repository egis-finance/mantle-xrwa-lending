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
import { useBorrowerDebt } from '@/hooks/useBorrowerDebt'
import { useOraclePrice } from '@/hooks/useOraclePrice'
import { useLoanHealth } from '@/hooks/useLoanHealth'
import { useSystemParams } from '@/hooks/useSystemParams'
import { useAcUSDYBalance } from '@/hooks/useAcUSDYBalance'
import { useSupplyAcUSDY } from '@/hooks/useSupplyAcUSDY'
import { useBorrowUSDC } from '@/hooks/useBorrowUSDC'
import { useRepayUSDC } from '@/hooks/useRepayUSDC'
import { useWithdrawAcUSDY } from '@/hooks/useWithdrawAcUSDY'

// Mock all dependencies
jest.mock('@/hooks/useDynamicWallet')
jest.mock('@/hooks/useSDKReady')
jest.mock('@/hooks/useMorphoCollateral')
jest.mock('@/hooks/useLockedUSDY')
jest.mock('@/hooks/useBorrowerBalance')
jest.mock('@/hooks/useBorrowerDebt')
jest.mock('@/hooks/useOraclePrice')
jest.mock('@/hooks/useLoanHealth')
jest.mock('@/hooks/useSystemParams')
jest.mock('@/hooks/useAcUSDYBalance')
jest.mock('@/hooks/useSupplyAcUSDY')
jest.mock('@/hooks/useBorrowUSDC')
jest.mock('@/hooks/useRepayUSDC')
jest.mock('@/hooks/useWithdrawAcUSDY')
jest.mock('@/components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}))

// Mock Dynamic SDK
let mockPrimaryWallet: object | null = {};
jest.mock('@dynamic-labs/sdk-react-core', () => ({
  useDynamicContext: () => ({ primaryWallet: mockPrimaryWallet }),
}));

let mockIsEthereumWallet = true;
jest.mock('@dynamic-labs/ethereum', () => ({
  isEthereumWallet: jest.fn(() => mockIsEthereumWallet),
}));

const mockUseDynamicWallet = useDynamicWallet as jest.MockedFunction<typeof useDynamicWallet>
const mockUseSDKReady = useSDKReady as jest.MockedFunction<typeof useSDKReady>
const mockUseMorphoCollateral = useMorphoCollateral as jest.MockedFunction<typeof useMorphoCollateral>
const mockUseLockedUSDY = useLockedUSDY as jest.MockedFunction<typeof useLockedUSDY>
const mockUseBorrowerBalance = useBorrowerBalance as jest.MockedFunction<typeof useBorrowerBalance>
const mockUseBorrowerDebt = useBorrowerDebt as jest.MockedFunction<typeof useBorrowerDebt>
const mockUseOraclePrice = useOraclePrice as jest.MockedFunction<typeof useOraclePrice>
const mockUseLoanHealth = useLoanHealth as jest.MockedFunction<typeof useLoanHealth>
const mockUseSystemParams = useSystemParams as jest.MockedFunction<typeof useSystemParams>
const mockUseAcUSDYBalance = useAcUSDYBalance as jest.MockedFunction<typeof useAcUSDYBalance>
const mockUseSupplyAcUSDY = useSupplyAcUSDY as jest.MockedFunction<typeof useSupplyAcUSDY>
const mockUseBorrowUSDC = useBorrowUSDC as jest.MockedFunction<typeof useBorrowUSDC>
const mockUseRepayUSDC = useRepayUSDC as jest.MockedFunction<typeof useRepayUSDC>
const mockUseWithdrawAcUSDY = useWithdrawAcUSDY as jest.MockedFunction<typeof useWithdrawAcUSDY>

// Minimal env config so BorrowPage doesn't show "App not configured".
process.env.NEXT_PUBLIC_MANTLE_LOCKER = '0x1111111111111111111111111111111111111111'
process.env.NEXT_PUBLIC_ETH_MORPHO = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'
process.env.NEXT_PUBLIC_MORPHO_MARKET_ID = '0x' + '11'.repeat(32)

describe('BorrowPage - Loan Health Component', () => {
  const mockRefetch = jest.fn()
  const mockReset = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset mutable mocks
    mockPrimaryWallet = {};
    mockIsEthereumWallet = true;

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
      data: { value: '100', raw: 100000000000000000000n },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      error: null,
      isRefetching: false,
    })

    mockUseLockedUSDY.mockReturnValue({
      data: { value: '1000' },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      error: null,
      isRefetching: false,
    })

    mockUseBorrowerBalance.mockReturnValue({
      data: { value: '5000' },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      error: null,
      isRefetching: false,
    })

    mockUseBorrowerDebt.mockReturnValue({
      data: { value: '50000', debtAssetsRaw: 50000000000n, borrowShares: 50000000000n, totalBorrowAssets: 500000000000n, totalBorrowShares: 500000000000n },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      error: null,
      isRefetching: false,
    })

    mockUseOraclePrice.mockReturnValue({
      data: { value: '1.05', haircutPercentage: 2, isStale: false, raw: 1050000000000000000000000n },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      error: null,
      isRefetching: false,
    })

    mockUseAcUSDYBalance.mockReturnValue({
      data: { value: '1000', raw: 1000000000000000000000n },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      error: null,
      isRefetching: false,
    })

    // Mock write hooks
    mockUseSupplyAcUSDY.mockReturnValue({
      supplyCollateral: jest.fn(),
      status: 'idle',
      statusMessage: '',
      error: null,
      txHash: null,
      reset: mockReset,
    })

    mockUseBorrowUSDC.mockReturnValue({
      borrow: jest.fn(),
      status: 'idle',
      statusMessage: '',
      error: null,
      txHash: null,
      reset: mockReset,
    })

    mockUseRepayUSDC.mockReturnValue({
      repay: jest.fn(),
      status: 'idle',
      statusMessage: '',
      error: null,
      txHash: null,
      reset: mockReset,
    })

    mockUseWithdrawAcUSDY.mockReturnValue({
      withdrawCollateral: jest.fn(),
      status: 'idle',
      statusMessage: '',
      error: null,
      txHash: null,
      reset: mockReset,
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
      oraclePriceRaw: 1050000000000000000000000n,
      oracleAddress: '0x1234567890123456789012345678901234567890',
      oracleHaircutPercentage: 2,
      oracleIsStale: false,
      lastUpdate: Date.now(),
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      marketParams: { loanToken: '0x1' as `0x${string}`, collateralToken: '0x2' as `0x${string}`, oracle: '0x3' as `0x${string}`, irm: '0x4' as `0x${string}`, lltv: 860000000000000000n },
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

	      // Check for $0 values (LoanHealthCard shows 2, action cards may show more)
	      expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(2)
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

    it('should render other page components when wallet connected', () => {
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
      // Action cards should render when wallet is connected
      // Note: Some text appears in both card headers and buttons, so use getAllByText
      expect(screen.getByText('Supply Collateral')).toBeInTheDocument()
      expect(screen.getAllByText('Borrow USDC').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Repay Debt').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Withdraw Collateral')).toBeInTheDocument()
    })

    it('should show connect wallet CTA when wallet not ready', () => {
      mockPrimaryWallet = null;
      mockIsEthereumWallet = false;

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

      // Check for connect wallet CTA
      expect(screen.getByText('Connect Wallet to Borrow')).toBeInTheDocument()
      // Action cards should NOT render when wallet not connected
      expect(screen.queryByText('Supply Collateral')).not.toBeInTheDocument()
    })

    it('should not pass address to read hooks when wallet not ready', () => {
      mockPrimaryWallet = null;
      mockIsEthereumWallet = false;

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

      expect(mockUseLockedUSDY).toHaveBeenCalledWith(undefined)
      expect(mockUseMorphoCollateral).toHaveBeenCalledWith(undefined)
      expect(mockUseAcUSDYBalance).toHaveBeenCalledWith(undefined)
      expect(mockUseBorrowerBalance).toHaveBeenCalledWith(undefined)
      expect(mockUseBorrowerDebt).toHaveBeenCalledWith(undefined)
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

  describe('Stale Oracle Warning', () => {
    it('should disable borrow button when oracle is stale', () => {
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

      // Oracle is stale
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
        oraclePriceRaw: 1050000000000000000000000n,
        oracleAddress: '0x1234567890123456789012345678901234567890',
        oracleHaircutPercentage: 2,
        oracleIsStale: true, // Stale!
        lastUpdate: Date.now() - 86400000, // 24 hours ago
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        marketParams: { loanToken: '0x1' as `0x${string}`, collateralToken: '0x2' as `0x${string}`, oracle: '0x3' as `0x${string}`, irm: '0x4' as `0x${string}`, lltv: 860000000000000000n },
      })

      render(<BorrowPage />)

      // Borrow button should be disabled (find by role since text appears multiple times)
      const borrowButtons = screen.getAllByRole('button', { name: /borrow/i })
      // The action button is the one with "Borrow USDC" text
      const borrowActionButton = borrowButtons.find(btn => btn.textContent?.includes('Borrow USDC'))
      expect(borrowActionButton).toBeDisabled()

      // Should show stale oracle warning
      expect(screen.getByText(/Oracle price stale/i)).toBeInTheDocument()
    })
  })

  describe('Unknown Debt Display', () => {
    it('should show "--" when debt data is null', () => {
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

      // Debt data is null/undefined
      mockUseBorrowerDebt.mockReturnValue({
        data: { value: '--', debtAssetsRaw: null, borrowShares: null, totalBorrowAssets: null, totalBorrowShares: null },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
        error: null,
        isRefetching: false,
      })

      render(<BorrowPage />)

      // Should show "--" for unknown debt in repay card
      const dashElements = screen.getAllByText('--')
      expect(dashElements.length).toBeGreaterThan(0)
    })
  })

  describe('Error Retry States', () => {
    it('should show retry button when morphoCollateral has error', () => {
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

      mockUseMorphoCollateral.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
        error: new Error('RPC error'),
        isRefetching: false,
      })

      render(<BorrowPage />)

      // Should show retry buttons for failed data (may appear in multiple cards)
      const failedMessages = screen.getAllByText(/Failed to load/i)
      expect(failedMessages.length).toBeGreaterThan(0)
      const retryButtons = screen.getAllByRole('button', { name: /retry/i })
      expect(retryButtons.length).toBeGreaterThan(0)
    })

    it('should show retry button when borrowerDebt has error', () => {
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

      mockUseBorrowerDebt.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
        error: new Error('RPC error'),
        isRefetching: false,
      })

      render(<BorrowPage />)

      // Should show retry button for failed debt data
      expect(screen.getByText(/failed to load debt/i)).toBeInTheDocument()
      const retryButtons = screen.getAllByRole('button', { name: /retry/i })
      expect(retryButtons.length).toBeGreaterThan(0)
    })
  })

  describe('Success Dismiss', () => {
    it('should call reset when dismiss button is clicked after success', async () => {
      const { fireEvent } = await import('@testing-library/react')

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

      // Supply hook in success state
      mockUseSupplyAcUSDY.mockReturnValue({
        supplyCollateral: jest.fn(),
        status: 'success',
        statusMessage: 'Collateral supplied!',
        error: null,
        txHash: '0x123' as `0x${string}`,
        reset: mockReset,
      })

      render(<BorrowPage />)

      // Should show success message
      expect(screen.getByText('Collateral supplied!')).toBeInTheDocument()

      // Should show dismiss button
      const dismissButton = screen.getByRole('button', { name: /dismiss/i })
      expect(dismissButton).toBeInTheDocument()

      // Click dismiss
      fireEvent.click(dismissButton)

      // Reset should be called
      expect(mockReset).toHaveBeenCalled()
    })

    it('should show dismiss button for all action cards on success', () => {
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

      // All hooks in success state
      mockUseSupplyAcUSDY.mockReturnValue({
        supplyCollateral: jest.fn(),
        status: 'success',
        statusMessage: 'Collateral supplied!',
        error: null,
        txHash: '0x123' as `0x${string}`,
        reset: mockReset,
      })

      mockUseBorrowUSDC.mockReturnValue({
        borrow: jest.fn(),
        status: 'success',
        statusMessage: 'USDC borrowed!',
        error: null,
        txHash: '0x456' as `0x${string}`,
        reset: mockReset,
      })

      mockUseRepayUSDC.mockReturnValue({
        repay: jest.fn(),
        status: 'success',
        statusMessage: 'Debt repaid!',
        error: null,
        txHash: '0x789' as `0x${string}`,
        reset: mockReset,
      })

      mockUseWithdrawAcUSDY.mockReturnValue({
        withdrawCollateral: jest.fn(),
        status: 'success',
        statusMessage: 'Collateral withdrawn!',
        error: null,
        txHash: '0xabc' as `0x${string}`,
        reset: mockReset,
      })

      render(<BorrowPage />)

      // Should show 4 dismiss buttons (one per card)
      const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i })
      expect(dismissButtons).toHaveLength(4)
    })
  })
})
