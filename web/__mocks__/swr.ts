// Mock for SWR
import type { ReactNode } from 'react';

const useSWR = jest.fn(() => ({
  data: undefined,
  error: undefined,
  isLoading: false,
  isValidating: false,
  mutate: jest.fn(),
}));

export default useSWR;

export const SWRConfig = ({ children }: { children: ReactNode }) => children;

export const mutate = jest.fn();
