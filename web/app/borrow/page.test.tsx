import { render, screen } from '@testing-library/react'
import BorrowPage from './page'

// Mock the Navbar component
jest.mock('@/components/Navbar', () => ({
    Navbar: () => <div data-testid="navbar">Navbar</div>,
}))

// Mock HardcodedUsdyBalance component to avoid wagmi import issues
jest.mock('@/components/HardcodedUsdyBalance', () => ({
    HardcodedUsdyBalance: () => <div data-testid="usdy-balance">Mock Balance</div>,
}))

// Mock hooks that use wagmi
jest.mock('@/hooks/useTvlPeg', () => ({
    useTvlPeg: () => ({
        mantle: { value: '100000' },
        isLoading: false,
    }),
}))

jest.mock('@/hooks/useBorrowerCollateral', () => ({
    useBorrowerCollateral: () => ({
        value: '50000',
        isLoading: false,
    }),
}))

jest.mock('@/hooks/useBorrowerBalance', () => ({
    useBorrowerBalance: () => ({
        value: '200000',
        isLoading: false,
    }),
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    ArrowRightLeft: () => <svg data-testid="icon-arrow" />,
    ShieldCheck: () => <svg data-testid="icon-shield" />,
    Lock: () => <svg data-testid="icon-lock" />,
    Wallet: () => <svg data-testid="icon-wallet" />,
}))

describe('BorrowPage', () => {
    it('renders the borrow page header', () => {
        render(<BorrowPage />)
        expect(screen.getByText('Borrower Terminal')).toBeInTheDocument()
        expect(screen.getByText('Manage your cross-chain collateral and Morpho Blue positions.')).toBeInTheDocument()
    })

    it('renders the Mantle RWA section', () => {
        render(<BorrowPage />)
        expect(screen.getByText('Mantle RWA')).toBeInTheDocument()
        expect(screen.getByText('Locked Amount')).toBeInTheDocument()
    })

    it('renders the Ethereum Collateral section', () => {
        render(<BorrowPage />)
        expect(screen.getByText('Ethereum Collateral')).toBeInTheDocument()
        expect(screen.getByText('Attested Collateral')).toBeInTheDocument()
    })

    it('renders the Safe Transaction Builder section', () => {
        render(<BorrowPage />)
        expect(screen.getByText('Safe Transaction Builder')).toBeInTheDocument()
        expect(screen.getByText('Borrow Amount (USDC)')).toBeInTheDocument()
    })

    it('renders the Loan Health section', () => {
        render(<BorrowPage />)
        expect(screen.getByText('Loan Health')).toBeInTheDocument()
        expect(screen.getByText('Current LTV')).toBeInTheDocument()
    })
})
