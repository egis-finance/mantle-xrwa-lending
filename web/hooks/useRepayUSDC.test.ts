/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useRepayUSDC } from './useRepayUSDC';

// Mock wallet client and public client
const mockWriteContract = jest.fn();
const mockGetAddresses = jest.fn();
const mockWaitForTransactionReceipt = jest.fn();
const mockGetNetwork = jest.fn();
const mockSwitchNetwork = jest.fn();
const mockGetWalletClient = jest.fn();

let mockPrimaryWallet: object | null = {
  getWalletClient: mockGetWalletClient,
  getNetwork: mockGetNetwork,
  switchNetwork: mockSwitchNetwork,
};

jest.mock('@dynamic-labs/sdk-react-core', () => ({
  useDynamicContext: () => ({ primaryWallet: mockPrimaryWallet }),
}));

let mockIsEthereumWallet = true;
jest.mock('@dynamic-labs/ethereum', () => ({
  isEthereumWallet: jest.fn(() => mockIsEthereumWallet),
}));

jest.mock('@/lib/swr/chains', () => ({
  getPublicClient: () => ({
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
  }),
}));

jest.mock('@/lib/swr/invalidation', () => ({
  invalidateUserReads: jest.fn(),
  invalidateBatchReads: jest.fn(),
}));

jest.mock('@/lib/dynamic/chains', () => ({
  normalizeChainId: (id: number | string) => (typeof id === 'string' ? parseInt(id, 10) : id),
}));

let mockMorphoAddress = '0xMorphoAddress' as `0x${string}`;
let mockUsdcAddress = '0xUSDCAddress' as `0x${string}`;

jest.mock('@/lib/contracts', () => ({
  get contracts() {
    return {
      morpho: {
        address: mockMorphoAddress,
        chainId: 1,
      },
      usdc: {
        address: mockUsdcAddress,
        chainId: 1,
      },
    };
  },
  ETHEREUM_CHAIN_ID: 1,
  UNCONFIGURED_ADDRESS: '0x0',
}));

const mockMarketParams = {
  loanToken: '0xLoanToken' as `0x${string}`,
  collateralToken: '0xCollateralToken' as `0x${string}`,
  oracle: '0xOracle' as `0x${string}`,
  irm: '0xIRM' as `0x${string}`,
  lltv: 860000000000000000n,
};

const mockUserAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`;
const mockApproveHash = '0xApproveHash' as `0x${string}`;
const mockRepayHash = '0xRepayHash' as `0x${string}`;

describe('useRepayUSDC', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mutable mocks to defaults
    mockPrimaryWallet = {
      getWalletClient: mockGetWalletClient,
      getNetwork: mockGetNetwork,
      switchNetwork: mockSwitchNetwork,
    };
    mockIsEthereumWallet = true;
    mockMorphoAddress = '0xMorphoAddress' as `0x${string}`;
    mockUsdcAddress = '0xUSDCAddress' as `0x${string}`;

    // Setup default mock return values
    mockGetWalletClient.mockResolvedValue({
      writeContract: mockWriteContract,
      getAddresses: mockGetAddresses,
    });
    mockGetAddresses.mockResolvedValue([mockUserAddress]);
    mockGetNetwork.mockResolvedValue(1);
    mockWriteContract.mockResolvedValueOnce(mockApproveHash).mockResolvedValueOnce(mockRepayHash);
    mockWaitForTransactionReceipt.mockResolvedValue({});
  });

  describe('Guardrails', () => {
    it('throws when wallet not connected', async () => {
      mockPrimaryWallet = null;

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(1000000n, false, null)).rejects.toThrow('No Ethereum wallet connected');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when wallet is non-Ethereum', async () => {
      mockIsEthereumWallet = false;

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(1000000n, false, null)).rejects.toThrow('No Ethereum wallet connected');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when Morpho contract unconfigured', async () => {
      mockMorphoAddress = '0x0' as `0x${string}`;

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(1000000n, false, null)).rejects.toThrow('Morpho contract not configured');
      });
    });

    it('throws when USDC contract unconfigured', async () => {
      mockUsdcAddress = '0x0' as `0x${string}`;

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(1000000n, false, null)).rejects.toThrow('USDC contract not configured');
      });
    });

    it('throws when marketParams not loaded', async () => {
      const { result } = renderHook(() => useRepayUSDC(undefined));

      await act(async () => {
        await expect(result.current.repay(1000000n, false, null)).rejects.toThrow('Market params not loaded');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when amount is zero (not full repay)', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(0n, false, null)).rejects.toThrow('Amount must be greater than zero');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when amount is negative', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(-1n, false, null)).rejects.toThrow('Amount must be greater than zero');
      });
      expect(result.current.status).toBe('error');
    });
  });

  describe('Full Repay Edge Cases', () => {
    it('throws when full repay but debt is null', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(0n, true, null)).rejects.toThrow('Cannot full repay when debt is unknown');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when full repay but debt is zero', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(0n, true, 0n)).rejects.toThrow('Cannot full repay when debt is zero');
      });
      expect(result.current.status).toBe('error');
    });

    it('approves buffered amount and repays by shares for full repay', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      const debtAssetsRaw = 1000000000n; // 1000 USDC
      const borrowShares = 123456789n;
      const expectedApproveAmount = (debtAssetsRaw * 1001n) / 1000n; // 1001 USDC

      await act(async () => {
        await result.current.repay(0n, true, debtAssetsRaw, borrowShares);
      });

      // Verify approve uses buffered amount
      expect(mockWriteContract).toHaveBeenNthCalledWith(1, {
        account: mockUserAddress,
        address: '0xUSDCAddress',
        abi: expect.any(Array),
        functionName: 'approve',
        args: ['0xMorphoAddress', expectedApproveAmount],
      });

      // Verify repay uses shares for full repay
      expect(mockWriteContract).toHaveBeenNthCalledWith(2, {
        account: mockUserAddress,
        address: '0xMorphoAddress',
        abi: expect.any(Array),
        functionName: 'repay',
        args: [mockMarketParams, 0n, borrowShares, mockUserAddress, '0x'],
      });
    });
  });

  describe('Status Transitions', () => {
    it('progresses through status states on success', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      expect(result.current.status).toBe('idle');

      await act(async () => {
        await result.current.repay(500000000n, false, null);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.txHash).toBe(mockRepayHash);
    });

    it('sets status to error on failure', async () => {
      mockWriteContract.mockReset();
      mockWriteContract.mockRejectedValueOnce(new Error('Insufficient USDC'));

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(500000000n, false, null)).rejects.toThrow('Insufficient USDC');
      });
      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toBe('Insufficient USDC');
    });
  });

  describe('Contract Calls', () => {
    it('calls approve then repay with correct args', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await result.current.repay(500000000n, false, null); // 500 USDC
      });

      // Verify approve call
      expect(mockWriteContract).toHaveBeenNthCalledWith(1, {
        account: mockUserAddress,
        address: '0xUSDCAddress',
        abi: expect.any(Array),
        functionName: 'approve',
        args: ['0xMorphoAddress', 500000000n],
      });

      // Verify repay call
      expect(mockWriteContract).toHaveBeenNthCalledWith(2, {
        account: mockUserAddress,
        address: '0xMorphoAddress',
        abi: expect.any(Array),
        functionName: 'repay',
        args: [mockMarketParams, 500000000n, 0n, mockUserAddress, '0x'],
      });
    });

    it('switches network if not on Ethereum', async () => {
      mockGetNetwork.mockResolvedValueOnce(5000); // Mantle chain ID

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await result.current.repay(500000000n, false, null);
      });

      expect(mockSwitchNetwork).toHaveBeenCalledWith(1);
    });
  });

  describe('Cache Invalidation', () => {
    it('invalidates caches after successful transaction', async () => {
      const { invalidateUserReads, invalidateBatchReads } = jest.requireMock('@/lib/swr/invalidation');

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await result.current.repay(500000000n, false, null);
      });

      expect(invalidateBatchReads).toHaveBeenCalledWith(1);
      expect(invalidateUserReads).toHaveBeenCalledWith(mockUserAddress);
    });
  });

  describe('Reset', () => {
    it('resets status and error on reset', async () => {
      mockWriteContract.mockReset();
      mockWriteContract.mockRejectedValueOnce(new Error('Fail'));

      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await expect(result.current.repay(500000000n, false, null)).rejects.toThrow();
      });
      expect(result.current.status).toBe('error');

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.txHash).toBeNull();
    });
  });

  describe('Status Messages', () => {
    it('returns correct status message for idle', () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));
      expect(result.current.statusMessage).toBe('');
    });

    it('returns correct status message for success', async () => {
      const { result } = renderHook(() => useRepayUSDC(mockMarketParams));

      await act(async () => {
        await result.current.repay(500000000n, false, null);
      });

      expect(result.current.statusMessage).toBe('Debt repaid!');
    });
  });
});
