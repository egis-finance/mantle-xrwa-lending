describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'development' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('contract address validation', () => {
    const validEnv = {
      NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: 'test-id',
      NEXT_PUBLIC_MANTLE_RPC_VTE: 'http://localhost:8545',
      NEXT_PUBLIC_ETHEREUM_RPC_VTE: 'http://localhost:8546',
      NEXT_PUBLIC_MANTLE_VTE_EXPLORER: 'https://explorer.test',
      NEXT_PUBLIC_ETHEREUM_VTE_EXPLORER: 'https://explorer.test',
      NEXT_PUBLIC_MANTLE_LOCKER: '0x1111111111111111111111111111111111111111',
      NEXT_PUBLIC_MANTLE_USDY: '0x5bE26527e817998A7206475496fDE1E68957c5A6',
      NEXT_PUBLIC_ETH_ACUSDY: '0x2222222222222222222222222222222222222222',
      NEXT_PUBLIC_ETH_MORPHO: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
      NEXT_PUBLIC_ETH_ORACLE: '0x3333333333333333333333333333333333333333',
      NEXT_PUBLIC_ETH_ADAPTER: '0x4444444444444444444444444444444444444444',
      NEXT_PUBLIC_ETH_USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      NEXT_PUBLIC_ETH_IRM: '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC',
    };

    // Dynamic import to get fresh module state for each test
    const getValidateEnv = async () => {
      const { validateEnv } = await import('./env');
      return validateEnv;
    };

    it('accepts valid addresses', async () => {
      process.env = { ...process.env, ...validEnv };
      const validateEnv = await getValidateEnv();
      expect(() => validateEnv()).not.toThrow();
    });

    it('rejects all-zeros address', async () => {
      process.env = {
        ...process.env,
        ...validEnv,
        NEXT_PUBLIC_ETH_ACUSDY: '0x0000000000000000000000000000000000000000',
      };
      const validateEnv = await getValidateEnv();
      expect(() => validateEnv()).toThrow('cannot be all zeros');
    });

    it('rejects invalid hex format', async () => {
      process.env = {
        ...process.env,
        ...validEnv,
        NEXT_PUBLIC_ETH_ACUSDY: '0xINVALID',
      };
      const validateEnv = await getValidateEnv();
      expect(() => validateEnv()).toThrow('must be 42-character hex address');
    });

    it('rejects cross-chain address equality without override', async () => {
      const sameAddr = '0x1111111111111111111111111111111111111111';
      process.env = {
        ...process.env,
        ...validEnv,
        NEXT_PUBLIC_MANTLE_LOCKER: sameAddr,
        NEXT_PUBLIC_ETH_ACUSDY: sameAddr,
      };
      const validateEnv = await getValidateEnv();
      expect(() => validateEnv()).toThrow('AcUSDY (Ethereum) and CollateralLocker (Mantle)');
    });

    it('allows cross-chain equality with override', async () => {
      const sameAddr = '0x1111111111111111111111111111111111111111';
      process.env = {
        ...process.env,
        ...validEnv,
        NEXT_PUBLIC_MANTLE_LOCKER: sameAddr,
        NEXT_PUBLIC_ETH_ACUSDY: sameAddr,
        SKIP_ADDRESS_EQUALITY_CHECK: 'true',
      };
      const validateEnv = await getValidateEnv();
      expect(() => validateEnv()).not.toThrow();
    });

    it('requires MANTLE_USDY in VTE mode', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { NEXT_PUBLIC_MANTLE_USDY: _omit, ...envWithoutUsdy } = validEnv;
      process.env = { ...process.env, ...envWithoutUsdy };
      // Explicitly remove MANTLE_USDY (may have been loaded from .env.local)
      delete process.env.NEXT_PUBLIC_MANTLE_USDY;
      const validateEnv = await getValidateEnv();
      expect(() => validateEnv()).toThrow('NEXT_PUBLIC_MANTLE_USDY');
    });
  });
});
