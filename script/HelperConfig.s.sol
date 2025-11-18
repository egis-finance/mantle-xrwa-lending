// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

/**
 * Centralized network configuration for Tenderly Virtual TestNets
 * Provides RPC URLs and contract addresses for both Mantle and Ethereum VTEs
 *
 * Design rationale: Single source of truth for network params prevents configuration drift
 * across deployment and test scripts. VTE addresses mirror mainnet contracts for realistic testing.
 */
contract HelperConfig is Script {
    struct MantleConfig {
        string rpcUrl;
        address usdy;
        address admin;
        uint256 chainId;
    }

    struct EthereumConfig {
        string rpcUrl;
        address morpho;
        address usdc;
        address irm;
        address admin;
        uint256 chainId;
    }

    /// Default chain IDs for mainnet (can be overridden via .env)
    uint256 constant MANTLE_MAINNET_CHAIN_ID = 5000;
    uint256 constant ETHEREUM_MAINNET_CHAIN_ID = 1;

    /**
     * Returns Mantle Virtual TestNet configuration
     * USDY address is the real Ondo Finance deployment on Mantle mainnet
     *
     * Chain ID note:
     * - Tenderly VTE uses custom chain IDs to avoid conflicts (14996)
     * - Mainnet uses 5000
     * - Configure via MANTLE_CHAIN_ID in .env
     */
    function getMantleVteConfig() public view returns (MantleConfig memory) {
        return MantleConfig({
            rpcUrl: vm.envString("MANTLE_RPC_VTE"),
            usdy: vm.envAddress("MANTLE_USDY"),
            admin: vm.envAddress("ADMIN_ADDRESS"),
            chainId: vm.envOr("MANTLE_CHAIN_ID", MANTLE_MAINNET_CHAIN_ID)
        });
    }

    /**
     * Returns Ethereum Virtual TestNet configuration
     * All addresses point to real Morpho Blue mainnet deployment
     *
     * Chain ID note:
     * - Tenderly VTE uses custom chain IDs to avoid conflicts (10002)
     * - Mainnet uses 1
     * - Configure via ETHEREUM_CHAIN_ID in .env
     */
    function getEthereumVteConfig() public view returns (EthereumConfig memory) {
        return EthereumConfig({
            rpcUrl: vm.envString("ETHEREUM_RPC_VTE"),
            morpho: vm.envAddress("ETH_MORPHO"),
            usdc: vm.envAddress("ETH_USDC"),
            irm: vm.envAddress("ETH_IRM"),
            admin: vm.envAddress("ADMIN_ADDRESS"),
            chainId: vm.envOr("ETHEREUM_CHAIN_ID", ETHEREUM_MAINNET_CHAIN_ID)
        });
    }

    /**
     * Returns current chain ID for network detection
     * Relies on block.chainid which Tenderly VTE correctly reports
     */
    function getActiveChainId() public view returns (uint256) {
        return block.chainid;
    }
}
