/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import AdminReleaseQueuePage from './page';
import { useReleaseQueue } from '@/hooks/useReleaseQueue';
import { useCollateralLockerAdmin } from '@/hooks/useCollateralLockerAdmin';
import { useUnlockCollateral } from '@/hooks/useUnlockCollateral';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';

// Mock all dependencies
jest.mock('@/hooks/useReleaseQueue');
jest.mock('@/hooks/useCollateralLockerAdmin');
jest.mock('@/hooks/useUnlockCollateral');
jest.mock('@/hooks/useDynamicWallet');
jest.mock('@/components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}));
jest.mock('@/components/Footer', () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

const mockUseReleaseQueue = useReleaseQueue as jest.MockedFunction<typeof useReleaseQueue>;
const mockUseCollateralLockerAdmin = useCollateralLockerAdmin as jest.MockedFunction<typeof useCollateralLockerAdmin>;
const mockUseUnlockCollateral = useUnlockCollateral as jest.MockedFunction<typeof useUnlockCollateral>;
const mockUseDynamicWallet = useDynamicWallet as jest.MockedFunction<typeof useDynamicWallet>;

// Minimal env config
process.env.NEXT_PUBLIC_MANTLE_LOCKER = '0x1111111111111111111111111111111111111111';
process.env.NEXT_PUBLIC_ETH_MORPHO = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
process.env.NEXT_PUBLIC_MORPHO_MARKET_ID = '0x' + '11'.repeat(32);

describe('AdminReleaseQueuePage', () => {
  const mockRefetch = jest.fn();
  const mockUnlock = jest.fn();
  const mockReset = jest.fn();

  const defaultRequests = [
    {
      borrower: '0x1234567890123456789012345678901234567890' as const,
      lockedAmount: '100.0',
      lockedAmountRaw: 100n * 10n ** 18n,
      debtShares: 0n,
      status: 'ready' as const,
      lastLockId: ('0x' + 'a'.repeat(64)) as `0x${string}`,
    },
    {
      borrower: '0x0987654321098765432109876543210987654321' as const,
      lockedAmount: '50.0',
      lockedAmountRaw: 50n * 10n ** 18n,
      debtShares: 1000n,
      status: 'waiting' as const,
      lastLockId: ('0x' + 'b'.repeat(64)) as `0x${string}`,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: connected wallet, not admin
    mockUseDynamicWallet.mockReturnValue({
      address: '0xUserAddress1234567890123456789012345678',
      isConnected: true,
      isReady: true,
      chainId: 1,
      publicClient: undefined,
      walletClient: undefined,
      connect: jest.fn(),
      switchNetwork: jest.fn(),
    });

    mockUseReleaseQueue.mockReturnValue({
      requests: defaultRequests,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    mockUseCollateralLockerAdmin.mockReturnValue({
      adminAddress: '0xAdminAddress1234567890123456789012345678',
      isAdmin: false,
      isLoading: false,
      isError: false,
    });

    mockUseUnlockCollateral.mockReturnValue({
      unlock: mockUnlock,
      status: 'idle',
      statusMessage: '',
      error: null,
      txHash: null,
      reset: mockReset,
    });
  });

  it('renders admin banner and summary cards', () => {
    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('Admin Control Panel')).toBeInTheDocument();
    expect(screen.getByText('Release Queue Management - Privileged administrative functions')).toBeInTheDocument();
    expect(screen.getByText('Total in Queue')).toBeInTheDocument();
    expect(screen.getByText('Ready for Release')).toBeInTheDocument();
  });

  it('shows Read-Only badge for non-admin users', () => {
    mockUseCollateralLockerAdmin.mockReturnValue({
      adminAddress: '0xAdminAddress1234567890123456789012345678',
      isAdmin: false,
      isLoading: false,
      isError: false,
    });

    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('Read-Only')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows Admin badge for admin users', () => {
    mockUseCollateralLockerAdmin.mockReturnValue({
      adminAddress: '0xUserAddress1234567890123456789012345678',
      isAdmin: true,
      isLoading: false,
      isError: false,
    });

    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Read-Only')).not.toBeInTheDocument();
  });

  it('hides Action column for non-admin users', () => {
    mockUseCollateralLockerAdmin.mockReturnValue({
      adminAddress: '0xAdminAddress1234567890123456789012345678',
      isAdmin: false,
      isLoading: false,
      isError: false,
    });

    render(<AdminReleaseQueuePage />);

    // Table headers: Borrower, Locked Amount, Status (no Action)
    expect(screen.getByText('Borrower')).toBeInTheDocument();
    expect(screen.getByText('Locked Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByText('Action')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlock/i })).not.toBeInTheDocument();
  });

  it('shows Action column with Unlock buttons for admin users', () => {
    mockUseCollateralLockerAdmin.mockReturnValue({
      adminAddress: '0xUserAddress1234567890123456789012345678',
      isAdmin: true,
      isLoading: false,
      isError: false,
    });

    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('Action')).toBeInTheDocument();
    // Should have Unlock buttons (one enabled for ready, one disabled for waiting)
    const unlockButtons = screen.getAllByRole('button', { name: /unlock/i });
    expect(unlockButtons.length).toBe(2);
  });

  it('enables Unlock button only for ready requests', () => {
    mockUseCollateralLockerAdmin.mockReturnValue({
      adminAddress: '0xUserAddress1234567890123456789012345678',
      isAdmin: true,
      isLoading: false,
      isError: false,
    });

    render(<AdminReleaseQueuePage />);

    const unlockButtons = screen.getAllByRole('button', { name: /unlock/i });
    // First request is 'ready', button should be enabled
    expect(unlockButtons[0]).not.toBeDisabled();
    // Second request is 'waiting', button should be disabled
    expect(unlockButtons[1]).toBeDisabled();
  });

  it('displays correct status badges', () => {
    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('displays borrower addresses truncated', () => {
    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('0x1234...7890')).toBeInTheDocument();
    expect(screen.getByText('0x0987...4321')).toBeInTheDocument();
  });

  it('displays locked amounts', () => {
    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('100.0 USDY')).toBeInTheDocument();
    expect(screen.getByText('50.0 USDY')).toBeInTheDocument();
  });

  it('shows loading state when queue is loading', () => {
    mockUseReleaseQueue.mockReturnValue({
      requests: [],
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    });

    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('Loading release queue...')).toBeInTheDocument();
  });

  it('shows error state when queue fails to load', () => {
    mockUseReleaseQueue.mockReturnValue({
      requests: [],
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });

    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('Failed to load release queue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows empty state when no borrowers in queue', () => {
    mockUseReleaseQueue.mockReturnValue({
      requests: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    render(<AdminReleaseQueuePage />);

    expect(screen.getByText('No borrowers in queue')).toBeInTheDocument();
  });

  it('renders footer with admin panel link', () => {
    render(<AdminReleaseQueuePage />);

    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('shows correct summary statistics', () => {
    render(<AdminReleaseQueuePage />);

    // Total in Queue: 2
    expect(screen.getByText('2')).toBeInTheDocument();
    // Ready for Release: 1 (only one request with status 'ready')
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
