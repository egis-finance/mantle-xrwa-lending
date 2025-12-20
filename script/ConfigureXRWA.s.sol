// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {AcUSDY} from "../contracts/ethereum/AcUSDY.sol";
import {XRWAReceiver} from "../contracts/ethereum/XRWAReceiver.sol";
import {IMorpho, MarketParams, Market, Id} from "../contracts/interfaces/IMorpho.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/**
 * ConfigureXRWA - Cross-Chain Configuration Script
 *
 * Configures the deployed xRWA contracts for cross-chain operation:
 * 1. Creates Morpho Blue market for USDC/AcUSDY lending
 * 2. Registers Mantle locker in XRWAReceiver allowlist
 * 3. Whitelists Morpho Blue in AcUSDY for collateral transfers
 *
 * CHAIN ID NOTICE:
 * - Tenderly VTE: Mantle = 15000, Ethereum = 10001
 * - Mainnet: Mantle = 5000, Ethereum = 1
 * - This script uses actual chain IDs from HelperConfig (.env)
 * - lockId computation includes chainId, so VTE lockIds ≠ mainnet lockIds
 * - EIP-712 signatures are chain-specific (DOMAIN_SEPARATOR includes chainId)
 *
 * Usage:
 *   forge script script/ConfigureXRWA.s.sol:ConfigureXRWA \
 *     --rpc-url $ETHEREUM_RPC_VTE \
 *     --broadcast \
 *     --legacy
 *
 * Prerequisites:
 *   - DeployMantle.s.sol completed (MANTLE_LOCKER in .env)
 *   - DeployEthereum.s.sol completed (ETH_* addresses in .env)
 *
 * Post-configuration:
 *   - System ready for E2E testing
 *   - Test: Lock USDY (Mantle) → Mint AcUSDY → Borrow USDC
 */
contract ConfigureXRWA is Script {
    /// Market LLTV: 86% (must match DeployEthereum.s.sol)
    uint256 constant MARKET_LLTV = 0.86e18;

    function run() external {
        // Load network configurations
        HelperConfig config = new HelperConfig();
        HelperConfig.MantleConfig memory mantleConfig = config.getMantleVteConfig();
        HelperConfig.EthereumConfig memory ethConfig = config.getEthereumVteConfig();

        address mantleLocker = vm.envAddress("MANTLE_LOCKER");
        address acUsdyAddr = vm.envAddress("ETH_ACUSDY");
        address receiverAddr = vm.envAddress("ETH_RECEIVER");
        address oracleAddr = vm.envAddress("ETH_ORACLE");
        address adapterAddr = vm.envAddress("ETH_ADAPTER");

        uint256 adminPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");

        _configure(
            mantleConfig, ethConfig, mantleLocker, acUsdyAddr, receiverAddr, oracleAddr, adapterAddr, adminPrivateKey
        );
    }

    function runWithConfig(
        HelperConfig.MantleConfig memory mantleConfig,
        HelperConfig.EthereumConfig memory ethConfig,
        address mantleLocker,
        address acUsdyAddr,
        address receiverAddr,
        address oracleAddr,
        address adapterAddr,
        uint256 adminPrivateKey
    ) external {
        _configure(
            mantleConfig, ethConfig, mantleLocker, acUsdyAddr, receiverAddr, oracleAddr, adapterAddr, adminPrivateKey
        );
    }

    function _configure(
        HelperConfig.MantleConfig memory mantleConfig,
        HelperConfig.EthereumConfig memory ethConfig,
        address mantleLocker,
        address acUsdyAddr,
        address receiverAddr,
        address oracleAddr,
        address adapterAddr,
        uint256 adminPrivateKey
    ) internal {
        // Store chain IDs early to avoid stack issues
        uint256 mantleChainId = mantleConfig.chainId;
        uint256 ethChainId = ethConfig.chainId;
        address morphoAddr = ethConfig.morpho;

        console2.log("=== Configuring xRWA Cross-Chain Bridge ===");
        console2.log("");
        console2.log("Chain IDs:");
        console2.log("  Mantle (source):", mantleChainId);
        console2.log("  Ethereum (destination):", ethChainId);
        console2.log("");
        console2.log("Deployed Contracts:");
        console2.log("  Mantle Locker:", mantleLocker);
        console2.log("  AcUSDY:", acUsdyAddr);
        console2.log("  XRWAReceiver:", receiverAddr);
        console2.log("  MorphoAdapter:", adapterAddr);
        console2.log("  Morpho Blue:", morphoAddr);
        console2.log("");

        // Initialize contract interfaces
        IMorpho morpho = IMorpho(morphoAddr);
        AcUSDY acUsdy = AcUSDY(acUsdyAddr);
        XRWAReceiver receiver = XRWAReceiver(receiverAddr);

        // Build market parameters (must match what adapter was initialized with)
        MarketParams memory params = MarketParams({
            loanToken: ethConfig.usdc,
            collateralToken: acUsdyAddr,
            oracle: oracleAddr,
            irm: ethConfig.irm,
            lltv: MARKET_LLTV
        });
        Id marketId = Id.wrap(keccak256(abi.encode(params)));

        // Start broadcasting transactions
        vm.startBroadcast(adminPrivateKey);

        // 1. Create Morpho Blue market (with idempotency check)
        console2.log("=== Step 1: Create Morpho Market ===");
        Market memory existingMarket = morpho.market(marketId);
        if (existingMarket.lastUpdate == 0) {
            console2.log("Creating new market...");
            morpho.createMarket(params);
            console2.log("  Market created successfully");
        } else {
            console2.log("  Market already exists (skipping creation)");
        }
        console2.log("  Market ID:", vm.toString(Id.unwrap(marketId)));
        console2.log("");

        // 2. Configure XRWAReceiver to allow Mantle locker
        console2.log("=== Step 2: Configure XRWAReceiver ===");
        console2.log("Registering Mantle locker allowlist...");
        console2.log("  Chain ID:", mantleChainId);
        console2.log("  Locker:", mantleLocker);
        receiver.setLocker(mantleChainId, mantleLocker, true);
        console2.log("  Locker registered successfully");
        console2.log("");

        // 3. Configure AcUSDY transfer whitelist (via XRWAReceiver)
        console2.log("=== Step 3: Configure AcUSDY Transfer Whitelist ===");

        // Whitelist Morpho Blue for collateral operations
        if (!acUsdy.transferAllowed(morphoAddr)) {
            console2.log("Whitelisting Morpho Blue:", morphoAddr);
            receiver.setAcUSDYTransferAllowed(morphoAddr, true);
            console2.log("  Morpho whitelisted successfully");
        } else {
            console2.log("  Morpho already whitelisted (skipping)");
        }

        // Whitelist MorphoAdapter for user convenience
        if (!acUsdy.transferAllowed(adapterAddr)) {
            console2.log("Whitelisting MorphoAdapter:", adapterAddr);
            receiver.setAcUSDYTransferAllowed(adapterAddr, true);
            console2.log("  Adapter whitelisted successfully");
        } else {
            console2.log("  Adapter already whitelisted (skipping)");
        }
        console2.log("");

        vm.stopBroadcast();

        // Verification
        _verifyConfiguration(morpho, marketId, receiver, acUsdy, mantleChainId, mantleLocker, morphoAddr, adapterAddr);

        // Next steps
        console2.log("=== Configuration Complete! ===");
        console2.log("");
        console2.log("Next Steps:");
        console2.log("1. Fund lenders with USDC on Ethereum VTE");
        console2.log("2. Lenders supply USDC to Morpho via adapter.supplyUSDC()");
        console2.log("3. Borrowers lock USDY on Mantle via locker.lock()");
        console2.log("4. Relayer/manual: Sign LockMessage and call receiver.mintWithAttestation()");
        console2.log("5. Borrowers supply AcUSDY as collateral via adapter.supplyCollateral()");
        console2.log("6. Borrowers borrow USDC via adapter.borrow()");
        console2.log("");
        console2.log("Ready for E2E testing!");
    }

    /// Internal helper to verify configuration (avoids stack too deep)
    function _verifyConfiguration(
        IMorpho morpho,
        Id marketId,
        XRWAReceiver receiver,
        AcUSDY acUsdy,
        uint256 srcChainId,
        address mantleLocker,
        address morphoAddr,
        address adapterAddr
    ) internal view {
        console2.log("=== Configuration Verification ===");
        console2.log("");

        console2.log("Morpho Market:");
        Market memory verifyMarket = morpho.market(marketId);
        console2.log("  Total supply assets:", verifyMarket.totalSupplyAssets);
        console2.log("  Total borrow assets:", verifyMarket.totalBorrowAssets);
        console2.log("  Last update:", verifyMarket.lastUpdate);
        console2.log("  Market exists:", verifyMarket.lastUpdate > 0 ? "YES" : "NO");
        console2.log("");

        console2.log("XRWAReceiver Configuration:");
        bool lockerAllowed = receiver.isLockerAllowed(srcChainId, mantleLocker);
        console2.log("  Locker allowed (chain", srcChainId, "):", lockerAllowed ? "YES" : "NO");
        console2.log("");

        console2.log("AcUSDY Transfer Whitelist:");
        console2.log("  Morpho Blue:", acUsdy.transferAllowed(morphoAddr) ? "YES" : "NO");
        console2.log("  MorphoAdapter:", acUsdy.transferAllowed(adapterAddr) ? "YES" : "NO");
        console2.log("");
    }
}
