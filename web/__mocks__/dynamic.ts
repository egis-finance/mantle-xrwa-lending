// Mock for @dynamic-labs/sdk-react-core
import type { ReactNode } from 'react';

export const useDynamicContext = jest.fn(() => ({
  primaryWallet: null,
  setShowAuthFlow: jest.fn(),
  sdkHasLoaded: true,
}));

export const useIsLoggedIn = jest.fn(() => false);

export const useSwitchNetwork = jest.fn(() => jest.fn());

export const DynamicContextProvider = ({ children }: { children: ReactNode }) => children;

export const DynamicWidget = () => null;

export const mergeNetworks = jest.fn((localNetworks, dashboardNetworks) => [
  ...localNetworks,
  ...dashboardNetworks,
]);
