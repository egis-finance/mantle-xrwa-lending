// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {AcUSDY} from "../contracts/ethereum/AcUSDY.sol";
import {XRWAReceiver} from "../contracts/ethereum/XRWAReceiver.sol";
import {NAVOracle} from "../contracts/ethereum/NAVOracle.sol";
import {MorphoAdapter} from "../contracts/ethereum/MorphoAdapter.sol";
import {MarketParams} from "../contracts/interfaces/IMorpho.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/**
 * Deploys all Ethereum-side contracts to Ethereum Virtual TestNet
 *
 * Deployment strategy:
 * - Deploy AcUSDY, XRWAReceiver, NAVOracle, and MorphoAdapter
 * - Handle AcUSDY ↔ XRWAReceiver circular dependency via address prediction
 * - Initialize MorphoAdapter with USDC/AcUSDY market parameters
 * - Output deployment addresses for .env update
 * - Defer cross-contract configuration to ConfigureXRWA.s.sol
 *
 * Usage:
 *   forge script script/DeployEthereum.s.sol:DeployEthereum \
 *     --rpc-url $ETHEREUM_RPC_VTE \
 *     --broadcast \
 *     --legacy
 *
 * Post-deployment:
 *   - Update .env with deployed addresses:
 *     ETH_XCUSDY=<acUsdy_address>
 *     ETH_RECEIVER=<receiver_address>
 *     ETH_ORACLE=<oracle_address>
 *     ETH_ADAPTER=<adapter_address>
 *   - Run ConfigureXRWA to wire contracts together
 *   - Test lock → mint → borrow flow
 */
contract DeployEthereum is Script {
    struct DeployedContracts {
        AcUSDY acUsdy;
        XRWAReceiver receiver;
        NAVOracle oracle;
        MorphoAdapter adapter;
    }

    /// Initial USDY NAV price: $1.02 in Morpho's 10^24 format
    /// This is a conservative starting point; will be updated via oracle in production
    uint256 constant INITIAL_NAV_PRICE = 1_020_000_000_000_000_000_000_000;

    /// Market LLTV: 86% (Morpho Blue enabled LLTV for quality assets)
    uint256 constant MARKET_LLTV = 0.86e18;

    function run() external returns (DeployedContracts memory) {
        HelperConfig config = new HelperConfig();
        HelperConfig.EthereumConfig memory ethConfig = config.getEthereumVteConfig();

        console2.log("=== Deploying Ethereum Contracts to Ethereum VTE ===");
        console2.log("Network:", ethConfig.chainId);
        console2.log("RPC URL:", ethConfig.rpcUrl);
        console2.log("Morpho Blue:", ethConfig.morpho);
        console2.log("USDC:", ethConfig.usdc);
        console2.log("IRM:", ethConfig.irm);
        console2.log("Admin:", ethConfig.admin);
        console2.log("");

        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address dvn1 = vm.envAddress("DVN1_ADDRESS");

        console2.log("Deployer address:", deployer);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Predict XRWAReceiver address to resolve AcUSDY ↔ XRWAReceiver circular dependency
        // XRWAReceiver will be deployed 2nd (after AcUSDY), so use nonce+1
        uint64 currentNonce = uint64(vm.getNonce(deployer));
        address predictedReceiver = vm.computeCreateAddress(deployer, currentNonce + 1);

        console2.log("Predicted XRWAReceiver address:", predictedReceiver);
        console2.log("");

        // 1. Deploy AcUSDY with predicted receiver
        console2.log("1/4 Deploying AcUSDY...");
        AcUSDY acUsdy = new AcUSDY(predictedReceiver);
        console2.log("   AcUSDY deployed at:", address(acUsdy));

        // 2. Deploy XRWAReceiver (address must match prediction)
        console2.log("2/4 Deploying XRWAReceiver...");
        XRWAReceiver receiver = new XRWAReceiver(address(acUsdy), ethConfig.admin, dvn1);
        console2.log("   XRWAReceiver deployed at:", address(receiver));
        require(address(receiver) == predictedReceiver, "Address prediction mismatch");

        // 3. Deploy NAVOracle
        console2.log("3/4 Deploying NAVOracle...");
        NAVOracle oracle = new NAVOracle(ethConfig.admin, INITIAL_NAV_PRICE);
        console2.log("   NAVOracle deployed at:", address(oracle));

        // 4. Deploy MorphoAdapter
        console2.log("4/4 Deploying MorphoAdapter...");
        MorphoAdapter adapter = new MorphoAdapter(ethConfig.morpho);
        console2.log("   MorphoAdapter deployed at:", address(adapter));

        // Initialize MorphoAdapter market parameters
        console2.log("");
        console2.log("Initializing Morpho market parameters...");
        MarketParams memory params = MarketParams({
            loanToken: ethConfig.usdc,
            collateralToken: address(acUsdy),
            oracle: address(oracle),
            irm: ethConfig.irm,
            lltv: MARKET_LLTV
        });
        adapter.initializeMarket(params);
        console2.log("   Market initialized with 86% LLTV");

        vm.stopBroadcast();

        // Verify deployment
        console2.log("");
        console2.log("=== Deployment Verification ===");
        console2.log("AcUSDY:");
        console2.log("  Name:", acUsdy.name());
        console2.log("  Symbol:", acUsdy.symbol());
        console2.log("  Receiver:", acUsdy.RECEIVER());
        console2.log("");
        console2.log("XRWAReceiver:");
        console2.log("  AcUSDY:", address(receiver.AC_USDY()));
        console2.log("  Admin:", receiver.admin());
        console2.log("  DVN1 allowed:", receiver.isDVNAllowed(dvn1));
        console2.log("");
        console2.log("NAVOracle:");
        console2.log("  Admin:", oracle.admin());
        console2.log("  Initial price:", oracle.currentPrice());
        console2.log("  Price with haircut:", oracle.getPriceWithHaircut());
        console2.log("");
        console2.log("MorphoAdapter:");
        console2.log("  Morpho:", address(adapter.MORPHO()));
        console2.log("  Market initialized: true");

        console2.log("");
        console2.log("=== Next Steps ===");
        console2.log("1. Update .env with deployed addresses:");
        console2.log("   ETH_XCUSDY=%s", address(acUsdy));
        console2.log("   ETH_RECEIVER=%s", address(receiver));
        console2.log("   ETH_ORACLE=%s", address(oracle));
        console2.log("   ETH_ADAPTER=%s", address(adapter));
        console2.log("");
        console2.log("2. Run ConfigureXRWA script to:");
        console2.log("   - Register Mantle locker in XRWAReceiver");
        console2.log("   - Whitelist Morpho in AcUSDY for transfers");
        console2.log("");
        console2.log("3. Test end-to-end flow:");
        console2.log("   - Lock USDY on Mantle -> Mint AcUSDY -> Borrow USDC");

        return DeployedContracts({acUsdy: acUsdy, receiver: receiver, oracle: oracle, adapter: adapter});
    }
}
