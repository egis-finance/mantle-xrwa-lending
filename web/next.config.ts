import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Enable static HTML export for Firebase Hosting
  images: {
    unoptimized: true, // Disable Image Optimization API for static export
  },
  transpilePackages: ['wagmi', 'viem', '@tanstack/react-query', '@reown/appkit', '@reown/appkit-adapter-wagmi'],
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
