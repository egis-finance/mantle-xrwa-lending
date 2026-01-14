/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useSupplyAcUSDY } from './useSupplyAcUSDY';

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
let mockAcUSDYAddress = '0xAcUSDYAddress' as `0x${string}`;

jest.mock('@/lib/contracts', () => ({
  get contracts() {
    return {
      morpho: {
        address: mockMorphoAddress,
        chainId: 1,
      },
      acUSDY: {
        address: mockAcUSDYAddress,
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
const mockSupplyHash = '0xSupplyHash' as `0x${string}`;

describe('useSupplyAcUSDY', () => {
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
    mockAcUSDYAddress = '0xAcUSDYAddress' as `0x${string}`;

    // Setup default mock return values
    mockGetWalletClient.mockResolvedValue({
      writeContract: mockWriteContract,
      getAddresses: mockGetAddresses,
    });
    mockGetAddresses.mockResolvedValue([mockUserAddress]);
    mockGetNetwork.mockResolvedValue(1);
    mockWriteContract.mockResolvedValueOnce(mockApproveHash).mockResolvedValueOnce(mockSupplyHash);
    mockWaitForTransactionReceipt.mockResolvedValue({});
  });

  describe('Guardrails', () => {
    it('throws when wallet not connected', async () => {
      mockPrimaryWallet = null;

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(1000n)).rejects.toThrow('No Ethereum wallet connected');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when wallet is non-Ethereum', async () => {
      mockIsEthereumWallet = false;

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(1000n)).rejects.toThrow('No Ethereum wallet connected');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when Morpho contract unconfigured', async () => {
      mockMorphoAddress = '0x0' as `0x${string}`;

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(1000n)).rejects.toThrow('Morpho contract not configured');
      });
    });

    it('throws when AcUSDY contract unconfigured', async () => {
      mockAcUSDYAddress = '0x0' as `0x${string}`;

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(1000n)).rejects.toThrow('AcUSDY contract not configured');
      });
    });

    it('throws when marketParams not loaded', async () => {
      const { result } = renderHook(() => useSupplyAcUSDY(undefined));

      await act(async () => {
        await expect(result.current.supplyCollateral(1000n)).rejects.toThrow('Market params not loaded');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when amount is zero', async () => {
      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(0n)).rejects.toThrow('Amount must be greater than zero');
      });
      expect(result.current.status).toBe('error');
    });

    it('throws when amount is negative', async () => {
      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(-1n)).rejects.toThrow('Amount must be greater than zero');
      });
      expect(result.current.status).toBe('error');
    });
  });

  describe('Status Transitions', () => {
    it('progresses through status states on success', async () => {
      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      expect(result.current.status).toBe('idle');

      await act(async () => {
        await result.current.supplyCollateral(1000000000000000000n);
      });

      expect(result.current.status).toBe('success');
      expect(result.current.txHash).toBe(mockSupplyHash);
    });

    it('sets status to error on failure', async () => {
      mockWriteContract.mockReset();
      mockWriteContract.mockRejectedValueOnce(new Error('User rejected'));

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(1000n)).rejects.toThrow('User rejected');
      });
      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toBe('User rejected');
    });
  });

  describe('Contract Calls', () => {
    it('calls approve then supplyCollateral with correct args', async () => {
      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await result.current.supplyCollateral(1000000000000000000n);
      });

      // Verify approve call
      expect(mockWriteContract).toHaveBeenNthCalledWith(1, {
        account: mockUserAddress,
        address: '0xAcUSDYAddress',
        abi: expect.any(Array),
        functionName: 'approve',
        args: ['0xMorphoAddress', 1000000000000000000n],
      });

      // Verify supplyCollateral call
      expect(mockWriteContract).toHaveBeenNthCalledWith(2, {
        account: mockUserAddress,
        address: '0xMorphoAddress',
        abi: expect.any(Array),
        functionName: 'supplyCollateral',
        args: [mockMarketParams, 1000000000000000000n, mockUserAddress, '0x'],
      });
    });

    it('switches network if not on Ethereum', async () => {
      mockGetNetwork.mockResolvedValueOnce(5000); // Mantle chain ID

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await result.current.supplyCollateral(1000n);
      });

      expect(mockSwitchNetwork).toHaveBeenCalledWith(1);
    });
  });

  describe('Cache Invalidation', () => {
    it('invalidates caches after successful transaction', async () => {
      const { invalidateUserReads, invalidateBatchReads } = jest.requireMock('@/lib/swr/invalidation');

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await result.current.supplyCollateral(1000n);
      });

      expect(invalidateBatchReads).toHaveBeenCalledWith(1);
      expect(invalidateUserReads).toHaveBeenCalledWith(mockUserAddress);
    });
  });

  describe('Reset', () => {
    it('resets status and error on reset', async () => {
      mockWriteContract.mockReset();
      mockWriteContract.mockRejectedValueOnce(new Error('Fail'));

      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await expect(result.current.supplyCollateral(1000n)).rejects.toThrow();
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
      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));
      expect(result.current.statusMessage).toBe('');
    });

    it('returns correct status message for success', async () => {
      const { result } = renderHook(() => useSupplyAcUSDY(mockMarketParams));

      await act(async () => {
        await result.current.supplyCollateral(1000n);
      });

      expect(result.current.statusMessage).toBe('Collateral supplied!');
    });
  });
});
