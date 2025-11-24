import { render } from '@testing-library/react'
import { SafeAutoConnect } from './SafeAutoConnect'

const mockUseSafeAutoConnect = jest.fn()

jest.mock('@/hooks/useSafeAutoConnect', () => ({
  useSafeAutoConnect: () => mockUseSafeAutoConnect(),
}))

describe('SafeAutoConnect', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render without crashing', () => {
    const { container } = render(<SafeAutoConnect />)
    expect(container).toBeEmptyDOMElement()
  })

  it('should call useSafeAutoConnect hook', () => {
    render(<SafeAutoConnect />)
    expect(mockUseSafeAutoConnect).toHaveBeenCalled()
  })
})
