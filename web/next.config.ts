import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['wagmi', '@rainbow-me/rainbowkit', 'viem', '@tanstack/react-query'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "pino-pretty": false,
      "lokijs": false,
      "encoding": false,
      "@base-org/account": false,
      "@coinbase/wallet-sdk": false,
      "@gemini-wallet/core": false,
      "@metamask/sdk": false,
      "porto": false,
    };
    return config;
  },
};

export default nextConfig;
