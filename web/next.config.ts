import type { NextConfig } from "next";

// Build-time env validation (NODE_ENV==='test' bypass keeps Jest safe)
import { validateEnv } from './lib/env';
validateEnv();

const nextConfig: NextConfig = {
  output: 'export', // Enable static HTML export for Firebase Hosting
  images: {
    unoptimized: true, // Disable Image Optimization API for static export
  },
  transpilePackages: ['viem', '@dynamic-labs/sdk-react-core', '@dynamic-labs/ethereum'],
  webpack: (config) => {
    // Disable server-side imports for packages that don't support SSR
    config.resolve.alias = {
      ...config.resolve.alias,
      "pino-pretty": false,
      "lokijs": false,
      "encoding": false,
      // Stub out React Native modules used by wallet SDKs
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
