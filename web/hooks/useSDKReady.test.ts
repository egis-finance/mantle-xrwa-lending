/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useSDKReady } from './useSDKReady';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useMounted } from './useMounted';

// Mock dependencies
jest.mock('@dynamic-labs/sdk-react-core');
jest.mock('./useMounted');

const mockUseDynamicContext = useDynamicContext as jest.MockedFunction<typeof useDynamicContext>;
const mockUseMounted = useMounted as jest.MockedFunction<typeof useMounted>;

describe('useSDKReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return false during SSR (mounted = false)', () => {
    mockUseMounted.mockReturnValue(false);
    mockUseDynamicContext.mockReturnValue({
      sdkHasLoaded: true,
    } as ReturnType<typeof useDynamicContext>);

    const { result } = renderHook(() => useSDKReady());

    expect(result.current).toBe(false);
  });

  it('should return false when SDK not loaded (sdkHasLoaded = false)', () => {
    mockUseMounted.mockReturnValue(true);
    mockUseDynamicContext.mockReturnValue({
      sdkHasLoaded: false,
    } as ReturnType<typeof useDynamicContext>);

    const { result } = renderHook(() => useSDKReady());

    expect(result.current).toBe(false);
  });

  it('should return true when both mounted and SDK loaded', () => {
    mockUseMounted.mockReturnValue(true);
    mockUseDynamicContext.mockReturnValue({
      sdkHasLoaded: true,
    } as ReturnType<typeof useDynamicContext>);

    const { result } = renderHook(() => useSDKReady());

    expect(result.current).toBe(true);
  });

  it('should return false when both conditions are false', () => {
    mockUseMounted.mockReturnValue(false);
    mockUseDynamicContext.mockReturnValue({
      sdkHasLoaded: false,
    } as ReturnType<typeof useDynamicContext>);

    const { result } = renderHook(() => useSDKReady());

    expect(result.current).toBe(false);
  });
});
