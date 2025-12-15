/* eslint-disable @typescript-eslint/no-require-imports */
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Mock Dynamic SDK
    '^@dynamic-labs/sdk-react-core$': '<rootDir>/__mocks__/dynamic.ts',
    '^@dynamic-labs/ethereum$': '<rootDir>/__mocks__/dynamicEthereum.ts',
    // Mock SWR
    '^swr$': '<rootDir>/__mocks__/swr.ts',
    // Mock CSS imports
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(viem|@dynamic-labs)/)',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
