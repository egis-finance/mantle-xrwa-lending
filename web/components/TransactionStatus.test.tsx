import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionStatus } from './TransactionStatus';

// Mock useDynamicWallet hook
jest.mock('@/hooks/useDynamicWallet', () => ({
  useDynamicWallet: jest.fn(() => ({
    chainId: 5000,
  })),
}));

// Mock getChainById
jest.mock('@/lib/dynamic/chains', () => ({
  getChainById: jest.fn((chainId: number) => {
    if (chainId === 5000) {
      return {
        chainId: 5000,
        name: 'Mantle',
        blockExplorerUrls: ['https://mantlescan.xyz'],
      };
    }
    if (chainId === 1) {
      return {
        chainId: 1,
        name: 'Ethereum',
        blockExplorerUrls: ['https://etherscan.io'],
      };
    }
    if (chainId === 15000) {
      return {
        chainId: 15000,
        name: 'Mantle VTE',
        blockExplorerUrls: ['https://dashboard.tenderly.co/explorer/vnet/abc123'],
      };
    }
    throw new Error('Unknown chain');
  }),
}));

describe('TransactionStatus', () => {
  const mockHash = '0x123abc';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Pending State', () => {
    it('renders pending state with spinner', () => {
      render(<TransactionStatus status="pending" />);
      expect(screen.getByText('Transaction pending...')).toBeInTheDocument();
    });

    it('renders custom pending message', () => {
      render(<TransactionStatus status="pending" message="Waiting for confirmation..." />);
      expect(screen.getByText('Waiting for confirmation...')).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('renders success state', () => {
      render(<TransactionStatus status="success" />);
      expect(screen.getByText('Transaction successful')).toBeInTheDocument();
    });

    it('renders custom success message', () => {
      render(<TransactionStatus status="success" message="Lock completed!" />);
      expect(screen.getByText('Lock completed!')).toBeInTheDocument();
    });

    it('renders explorer link when hash and chainId provided', () => {
      render(<TransactionStatus status="success" txHash={mockHash} chainId={5000} />);

      expect(screen.getByText('Transaction successful')).toBeInTheDocument();
      const link = screen.getByText('View');
      expect(link).toHaveAttribute('href', `https://mantlescan.xyz/tx/${mockHash}`);
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('uses wallet chainId when chainId prop not provided', () => {
      render(<TransactionStatus status="success" txHash={mockHash} />);

      const link = screen.getByText('View');
      expect(link).toHaveAttribute('href', `https://mantlescan.xyz/tx/${mockHash}`);
    });

    it('handles Tenderly VTE explorer URLs', () => {
      render(<TransactionStatus status="success" txHash={mockHash} chainId={15000} />);

      const link = screen.getByText('View');
      expect(link).toHaveAttribute(
        'href',
        `https://dashboard.tenderly.co/explorer/vnet/abc123/tx/${mockHash}`
      );
    });
  });

  describe('Error State', () => {
    it('renders error state', () => {
      render(<TransactionStatus status="error" />);
      expect(screen.getByText('Transaction failed')).toBeInTheDocument();
    });

    it('renders custom error message', () => {
      render(<TransactionStatus status="error" message="Insufficient funds" />);
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    });

    it('renders explorer link for failed transactions', () => {
      render(<TransactionStatus status="error" txHash={mockHash} chainId={1} />);

      const link = screen.getByText('View');
      expect(link).toHaveAttribute('href', `https://etherscan.io/tx/${mockHash}`);
    });
  });

  describe('Edge Cases', () => {
    it('does not render explorer link without txHash', () => {
      render(<TransactionStatus status="success" chainId={5000} />);

      expect(screen.getByText('Transaction successful')).toBeInTheDocument();
      expect(screen.queryByText('View')).not.toBeInTheDocument();
    });

    it('handles unknown chainId gracefully', () => {
      // getChainById throws for unknown chain
      render(<TransactionStatus status="success" txHash={mockHash} chainId={99999} />);

      expect(screen.getByText('Transaction successful')).toBeInTheDocument();
      expect(screen.queryByText('View')).not.toBeInTheDocument();
    });
  });
});
