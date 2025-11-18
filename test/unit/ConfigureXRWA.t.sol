// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {ConfigureXRWA} from "../../script/ConfigureXRWA.s.sol";
import {DeployEthereum} from "../../script/DeployEthereum.s.sol";
import {CollateralLocker} from "../../contracts/mantle/CollateralLocker.sol";
import {AcUSDY} from "../../contracts/ethereum/AcUSDY.sol";
import {XRWAReceiver} from "../../contracts/ethereum/XRWAReceiver.sol";
import {NAVOracle} from "../../contracts/ethereum/NAVOracle.sol";
import {MorphoAdapter} from "../../contracts/ethereum/MorphoAdapter.sol";
import {MarketParams, Id} from "../../contracts/interfaces/IMorpho.sol";
import {MockERC20, MockMorpho} from "../utils/Mocks.sol";

/**
 * Test ConfigureXRWA script
 * Verifies market creation, locker allowlist, and transfer whitelist configuration
 */
contract ConfigureXRWATest is Test {
    ConfigureXRWA internal configScript;
    DeployEthereum internal deployScript;

    // Deployed contracts
    CollateralLocker internal locker;
    AcUSDY internal acUsdy;
    XRWAReceiver internal receiver;
    NAVOracle internal oracle;
    MorphoAdapter internal adapter;

    // Mocks for Ethereum mainnet contracts
    MockMorpho internal morpho;
    MockERC20 internal usdy;
    MockERC20 internal usdc;

    // Test configuration
    address internal admin;
    address internal dvn1;
    address internal irm;

    // VTE chain IDs (not mainnet!)
    uint256 internal constant MANTLE_CHAIN_ID = 14996;
    uint256 internal constant ETHEREUM_CHAIN_ID = 10002;

    function setUp() public {
        configScript = new ConfigureXRWA();
        deployScript = new DeployEthereum();

        // Use the address that corresponds to the test private key
        uint256 adminPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        admin = vm.addr(adminPrivateKey);
        dvn1 = makeAddr("dvn1");
        irm = makeAddr("irm");

        // Create mocks for mainnet contracts
        usdy = new MockERC20("USDY", "USDY", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        morpho = new MockMorpho();

        // Set environment variables for scripts
        vm.setEnv("ADMIN_PRIVATE_KEY", vm.toString(adminPrivateKey));
        vm.setEnv("DVN1_ADDRESS", vm.toString(dvn1));
        vm.setEnv("ADMIN_ADDRESS", vm.toString(admin));
        vm.setEnv("ETH_MORPHO", vm.toString(address(morpho)));
        vm.setEnv("ETH_USDC", vm.toString(address(usdc)));
        vm.setEnv("ETH_IRM", vm.toString(irm));
        vm.setEnv("ETHEREUM_RPC_VTE", "http://localhost:8545");
        vm.setEnv("MANTLE_RPC_VTE", "http://localhost:8545");
        vm.setEnv("MANTLE_USDY", vm.toString(address(usdy)));
        vm.setEnv("MANTLE_CHAIN_ID", "14996");  // VTE chain ID
        vm.setEnv("ETHEREUM_CHAIN_ID", "10002");  // VTE chain ID

        // Deploy Mantle contract
        locker = new CollateralLocker(address(usdy), admin);

        // Deploy Ethereum contracts using DeployEthereum script
        DeployEthereum.DeployedContracts memory deployed = deployScript.run();
        acUsdy = deployed.acUsdy;
        receiver = deployed.receiver;
        oracle = deployed.oracle;
        adapter = deployed.adapter;

        // Set environment variables for deployed addresses
        vm.setEnv("MANTLE_LOCKER", vm.toString(address(locker)));
        vm.setEnv("ETH_XCUSDY", vm.toString(address(acUsdy)));
        vm.setEnv("ETH_RECEIVER", vm.toString(address(receiver)));
        vm.setEnv("ETH_ORACLE", vm.toString(address(oracle)));
        vm.setEnv("ETH_ADAPTER", vm.toString(address(adapter)));
    }

    function testMarketCreation() public {
        configScript.run();

        // Verify market was created on Morpho
        MarketParams memory params = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(acUsdy),
            oracle: address(oracle),
            irm: irm,
            lltv: 0.86e18
        });
        Id marketId = Id.wrap(keccak256(abi.encode(params)));

        // Market should exist (lastUpdate > 0)
        assertTrue(morpho.market(marketId).lastUpdate > 0, "Market should exist");
    }

    function testLockerAllowlistWithCorrectChainID() public {
        configScript.run();

        // Verify locker is allowed with VTE chain ID (14996), not mainnet (5000)
        bool allowed = receiver.isLockerAllowed(MANTLE_CHAIN_ID, address(locker));
        assertTrue(allowed, "Locker should be allowed with VTE chain ID");

        // Verify mainnet chain ID is NOT configured
        bool mainnetAllowed = receiver.isLockerAllowed(5000, address(locker));
        assertFalse(mainnetAllowed, "Locker should NOT be allowed with mainnet chain ID");
    }

    function testAcUSDYWhitelist() public {
        configScript.run();

        // Verify Morpho is whitelisted
        assertTrue(acUsdy.transferAllowed(address(morpho)), "Morpho should be whitelisted");

        // Verify adapter is whitelisted
        assertTrue(acUsdy.transferAllowed(address(adapter)), "Adapter should be whitelisted");
    }

    function testIdempotency() public {
        // Run configuration twice
        configScript.run();
        configScript.run();  // Should not revert

        // Verify configuration is still correct
        assertTrue(receiver.isLockerAllowed(MANTLE_CHAIN_ID, address(locker)), "Locker still allowed");
        assertTrue(acUsdy.transferAllowed(address(morpho)), "Morpho still whitelisted");
        assertTrue(acUsdy.transferAllowed(address(adapter)), "Adapter still whitelisted");
    }

    function testChainIDConfiguration() public {
        configScript.run();

        // Verify the script used VTE chain ID, not mainnet
        // This is evidenced by the locker being registered with chain ID 14996
        bool vteConfigured = receiver.isLockerAllowed(MANTLE_CHAIN_ID, address(locker));
        bool mainnetConfigured = receiver.isLockerAllowed(5000, address(locker));

        assertTrue(vteConfigured, "VTE chain ID should be configured");
        assertFalse(mainnetConfigured, "Mainnet chain ID should NOT be configured");
    }

    function testCompleteConfiguration() public {
        // Run full configuration
        configScript.run();

        // Verify market
        MarketParams memory params = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(acUsdy),
            oracle: address(oracle),
            irm: irm,
            lltv: 0.86e18
        });
        Id marketId = Id.wrap(keccak256(abi.encode(params)));
        assertTrue(morpho.market(marketId).lastUpdate > 0, "Market exists");

        // Verify XRWAReceiver
        assertTrue(receiver.isLockerAllowed(MANTLE_CHAIN_ID, address(locker)), "Locker allowed");
        assertEq(receiver.admin(), admin, "Receiver admin correct");
        assertTrue(receiver.isDVNAllowed(dvn1), "DVN allowed");

        // Verify AcUSDY
        assertEq(acUsdy.RECEIVER(), address(receiver), "AcUSDY receiver correct");
        assertTrue(acUsdy.transferAllowed(address(morpho)), "Morpho whitelisted");
        assertTrue(acUsdy.transferAllowed(address(adapter)), "Adapter whitelisted");

        // System is ready for E2E flow
        console2.log("Configuration complete - system ready for E2E testing");
    }
}
