import type { NextConfig } from "next";

// Build-time env validation (NODE_ENV==='test' bypass keeps Jest safe)
import { validateEnv } from './lib/env';
validateEnv();

const nextConfig: NextConfig = {
  // Note: 'output: export' removed - Vercel handles Next.js natively
  // For Firebase Hosting static export, run: NEXT_OUTPUT=export pnpm build
  ...(process.env.NEXT_OUTPUT === 'export' ? { output: 'export' as const } : {}),
  images: {
    unoptimized: true, // Required for static export compatibility
  },
  experimental: {
    // Tree-shake barrel imports from icon libraries (~400ms cold start improvement)
    optimizePackageImports: ['lucide-react'],
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
