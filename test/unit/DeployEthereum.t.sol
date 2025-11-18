// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {DeployEthereum} from "../../script/DeployEthereum.s.sol";
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

    function setUp() public {
        deployer = new DeployEthereum();

        admin = makeAddr("admin");
        dvn1 = makeAddr("dvn1");
        morpho = makeAddr("morpho");
        usdc = makeAddr("usdc");
        irm = makeAddr("irm");

        // Set environment variables for the script
        vm.setEnv("ADMIN_PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
        vm.setEnv("DVN1_ADDRESS", vm.toString(dvn1));
        vm.setEnv("ADMIN_ADDRESS", vm.toString(admin));
        vm.setEnv("ETH_MORPHO", vm.toString(morpho));
        vm.setEnv("ETH_USDC", vm.toString(usdc));
        vm.setEnv("ETH_IRM", vm.toString(irm));
        vm.setEnv("ETHEREUM_RPC_VTE", "http://localhost:8545");
    }

    function testDeploymentSucceeds() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.run();

        // Verify contracts were deployed
        assertTrue(address(contracts.acUsdy) != address(0), "AcUSDY not deployed");
        assertTrue(address(contracts.receiver) != address(0), "XRWAReceiver not deployed");
        assertTrue(address(contracts.oracle) != address(0), "NAVOracle not deployed");
        assertTrue(address(contracts.adapter) != address(0), "MorphoAdapter not deployed");
    }

    function testAcUSDYConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.run();

        assertEq(contracts.acUsdy.name(), "Attested Collateral USDY");
        assertEq(contracts.acUsdy.symbol(), "AcUSDY");
        assertEq(contracts.acUsdy.decimals(), 18);
        assertEq(contracts.acUsdy.RECEIVER(), address(contracts.receiver));
    }

    function testXRWAReceiverConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.run();

        assertEq(address(contracts.receiver.AC_USDY()), address(contracts.acUsdy));
        assertEq(contracts.receiver.admin(), admin);
        assertTrue(contracts.receiver.isDVNAllowed(dvn1));
    }

    function testNAVOracleConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.run();

        assertEq(contracts.oracle.admin(), admin);
        assertEq(contracts.oracle.currentPrice(), 1_020_000_000_000_000_000_000_000);
        assertTrue(contracts.oracle.price() > 0, "Oracle price should be non-zero");
    }

    function testMorphoAdapterConfiguration() public {
        DeployEthereum.DeployedContracts memory contracts = deployer.run();

        assertEq(address(contracts.adapter.MORPHO()), morpho);
    }
}
