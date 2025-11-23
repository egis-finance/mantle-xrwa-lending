import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionStatus } from './TransactionStatus';
import { useChainId } from 'wagmi';

// Mock wagmi
jest.mock('wagmi', () => ({
    useChainId: jest.fn(),
    useAccount: jest.fn(),
    usePublicClient: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn(() => Promise.resolve({
    ok: false,
    json: async () => ({}),
})) as jest.Mock;

describe('TransactionStatus', () => {
    const mockHash = '0x123';
    const mockSafeAddress = '0xSafe';

    beforeEach(() => {
        (useChainId as jest.Mock).mockReturnValue(5000); // Mantle
        (global.fetch as jest.Mock).mockClear();
        (global.fetch as jest.Mock).mockImplementation(() => Promise.resolve({
            ok: false,
            json: async () => ({}),
        }));
    });

    it('renders loading state initially', () => {
        render(<TransactionStatus hash={mockHash} />);
        expect(screen.getByText('Loading transaction status...')).toBeInTheDocument();
    });

    it('renders proposed state correctly', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                isExecuted: false,
                confirmations: ['0xSigner1'],
                confirmationsRequired: 2,
                safe: mockSafeAddress,
            }),
        });

        render(<TransactionStatus hash={mockHash} />);

        await waitFor(() => {
            expect(screen.getByText('Transaction Proposed')).toBeInTheDocument();
            expect(screen.getByText('Waiting for confirmations: 1/2')).toBeInTheDocument();
            expect(screen.getByText('View in Safe App')).toHaveAttribute(
                'href',
                `https://app.safe.global/transactions/tx?safe=mantle:${mockSafeAddress}&id=multisig_${mockSafeAddress}_${mockHash}`
            );
        });
    });

    it('renders executed state correctly', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                isExecuted: true,
                confirmations: ['0xSigner1', '0xSigner2'],
                confirmationsRequired: 2,
                safe: mockSafeAddress,
            }),
        });

        render(<TransactionStatus hash={mockHash} />);

        await waitFor(() => {
            expect(screen.getByText('Transaction Executed')).toBeInTheDocument();
            expect(screen.getByText('View')).toHaveAttribute(
                'href',
                `https://app.safe.global/transactions/tx?safe=mantle:${mockSafeAddress}&id=multisig_${mockSafeAddress}_${mockHash}`
            );
        });
    });

    it('handles fetch errors gracefully', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        render(<TransactionStatus hash={mockHash} />);

        await waitFor(() => {
            expect(screen.getByText('Loading transaction status...')).toBeInTheDocument();
        });

        expect(consoleSpy).toHaveBeenCalledWith('Error fetching Safe tx status:', expect.any(Error));
        consoleSpy.mockRestore();
    });
});
