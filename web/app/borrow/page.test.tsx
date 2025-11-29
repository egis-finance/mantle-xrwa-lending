import { render, screen } from '@testing-library/react'
import BorrowPage from './page'

// Mock the Navbar and other components to isolate page logic
jest.mock('@/components/Navbar', () => ({
    Navbar: () => <div data-testid="navbar">Navbar</div>,
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

    it('renders the Mantle Vault section', () => {
        render(<BorrowPage />)
        expect(screen.getByText('Mantle Vault')).toBeInTheDocument()
        expect(screen.getByText('150,000.00')).toBeInTheDocument()
    })

    it('renders the Ethereum Collateral section', () => {
        render(<BorrowPage />)
        expect(screen.getByText('Ethereum Collateral')).toBeInTheDocument()
        expect(screen.getByText('0.00')).toBeInTheDocument()
    })
})
