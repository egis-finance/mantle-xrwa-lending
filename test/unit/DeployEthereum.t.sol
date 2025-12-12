// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {DeployEthereum} from "../../script/DeployEthereum.s.sol";
import {HelperConfig} from "../../script/HelperConfig.s.sol";
import {AcUSDY} from "../../contracts/ethereum/AcUSDY.sol";
import {XRWAReceiver} from "../../contracts/ethereum/XRWAReceiver.sol";
import {NAVOracle} from "../../contracts/ethereum/NAVOracle.sol";
import {MorphoAdapter} from "../../contracts/ethereum/MorphoAdapter.sol";

/**
 * Test the DeployEthereum script logic
 * Verifies deployment order, address prediction, and initial configuration
 */
contract DeployEthereumTest is Test {
    DeployEthereum internal deployer;

    address internal admin;
    address internal dvn1;
    address internal morpho;
    address internal usdc;
    address internal irm;

    uint256 internal deployerPrivateKey;
    HelperConfig.EthereumConfig internal ethConfig;

    function setUp() public {
        deployer = new DeployEthereum();

        deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

        // Use deterministic addresses that don't depend on test execution order
        admin = address(uint160(uint256(keccak256("DeployEthereumTest.admin"))));
        dvn1 = address(uint160(uint256(keccak256("DeployEthereumTest.dvn1"))));
        morpho = address(uint160(uint256(keccak256("DeployEthereumTest.morpho"))));
        usdc = address(uint160(uint256(keccak256("DeployEthereumTest.usdc"))));
        irm = address(uint160(uint256(keccak256("DeployEthereumTest.irm"))));

        ethConfig = HelperConfig.EthereumConfig({
            rpcUrl: "http://localhost:8545",
            morpho: morpho,
            usdc: usdc,
            irm: irm,
            admin: admin,
            chainId: 10001
        });
    }

    function testDeploymentSucceeds() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.runWithConfig(ethConfig, deployerPrivateKey, dvn1);

        // Verify contracts were deployed
        assertTrue(address(contracts.acUsdy) != address(0), "AcUSDY not deployed");
        assertTrue(address(contracts.receiver) != address(0), "XRWAReceiver not deployed");
        assertTrue(address(contracts.oracle) != address(0), "NAVOracle not deployed");
        assertTrue(address(contracts.adapter) != address(0), "MorphoAdapter not deployed");
    }

    function testAcUSDYConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.runWithConfig(ethConfig, deployerPrivateKey, dvn1);

        assertEq(contracts.acUsdy.name(), "Attested Collateral USDY");
        assertEq(contracts.acUsdy.symbol(), "AcUSDY");
        assertEq(contracts.acUsdy.decimals(), 18);
        assertEq(contracts.acUsdy.RECEIVER(), address(contracts.receiver));
    }

    function testXRWAReceiverConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.runWithConfig(ethConfig, deployerPrivateKey, dvn1);

        assertEq(address(contracts.receiver.AC_USDY()), address(contracts.acUsdy));
        assertEq(contracts.receiver.admin(), admin);
        assertTrue(contracts.receiver.isDVNAllowed(dvn1));
    }

    function testNAVOracleConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.runWithConfig(ethConfig, deployerPrivateKey, dvn1);

        assertEq(contracts.oracle.admin(), admin);
        assertEq(contracts.oracle.currentPrice(), 1_020_000_000_000_000_000_000_000);
        assertTrue(contracts.oracle.price() > 0, "Oracle price should be non-zero");
    }

    function testMorphoAdapterConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.runWithConfig(ethConfig, deployerPrivateKey, dvn1);

        assertEq(address(contracts.adapter.MORPHO()), morpho);
    }
}
