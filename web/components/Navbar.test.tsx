import { render, screen } from '@testing-library/react';
import { Navbar } from './Navbar';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/dashboard'),
}));

// DynamicWidget is mocked via jest.config.js moduleNameMapper

// Mock connection module for ConnectionIndicator
jest.mock('@/lib/connection', () => require('../__mocks__/connection'));

describe('Navbar', () => {
  it('renders navigation items', () => {
    render(<Navbar />);

    expect(screen.getByText('Borrow')).toBeInTheDocument();
    expect(screen.getByText('Earn')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders the logo', () => {
    render(<Navbar />);

    expect(screen.getByAltText('Egis Finance')).toBeInTheDocument();
  });

  it('highlights active navigation item', () => {
    render(<Navbar />);

    // Mock pathname is /dashboard, so Dashboard link should be active
    const dashboardLink = screen.getByText('Dashboard');
    expect(dashboardLink.className).toContain('text-brand-DEFAULT');
    expect(dashboardLink.className).toContain('font-semibold');
  });
});
