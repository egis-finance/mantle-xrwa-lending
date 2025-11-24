import { render, screen } from '@testing-library/react'
import { Navbar } from './Navbar'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/dashboard'),
}))

jest.mock('./SafeAutoConnect', () => ({
  SafeAutoConnect: () => null,
}))

describe('Navbar', () => {
  it('renders navigation items', () => {
    render(<Navbar />)

    expect(screen.getByText('Borrow')).toBeInTheDocument()
    expect(screen.getByText('Earn')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('renders the logo', () => {
    render(<Navbar />)

    expect(screen.getByAltText('Egis Finance')).toBeInTheDocument()
  })

  it('renders the AppKit wallet button', () => {
    render(<Navbar />)

    const button = document.querySelector('w3m-button')
    expect(button).toBeInTheDocument()
  })

  it('highlights active navigation item', () => {
    render(<Navbar />)

    const borrowLink = screen.getByText('Borrow')
    expect(borrowLink.className).toContain('text-brand-DEFAULT')
    expect(borrowLink.className).toContain('font-semibold')
  })
})
