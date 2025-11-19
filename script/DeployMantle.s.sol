// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CollateralLocker} from "../contracts/mantle/CollateralLocker.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/**
 * Deploys CollateralLocker to Mantle Virtual TestNet
 *
 * Deployment strategy:
 * - Use admin wallet as deployer and contract administrator
 * - Configure with real USDY address on Mantle
 * - Output deployment address for .env update
 * - Verify deployment state before finalizing
 *
 * Usage:
 *   forge script script/DeployMantle.s.sol:DeployMantle \
 *     --rpc-url $MANTLE_RPC_VTE \
 *     --broadcast \
 *     --legacy
 *
 * Post-deployment:
 *   - Update .env with MANTLE_LOCKER=<deployed_address>
 *   - Run FundWallets to distribute test funds
 *   - Run TestLock to verify functionality
 */
contract DeployMantle is Script {
    function run() external returns (CollateralLocker) {
        HelperConfig config = new HelperConfig();
        HelperConfig.MantleConfig memory mantleConfig = config.getMantleVteConfig();

        console2.log("=== Deploying CollateralLocker to Mantle VTE ===");
        console2.log("Network:", mantleConfig.chainId);
        console2.log("RPC URL:", mantleConfig.rpcUrl);
        console2.log("USDY Address:", mantleConfig.usdy);
        console2.log("Admin Address:", mantleConfig.admin);
        console2.log("");

        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy CollateralLocker
        CollateralLocker locker = new CollateralLocker(mantleConfig.usdy, mantleConfig.admin);

        console2.log("CollateralLocker deployed at:", address(locker));

        vm.stopBroadcast();

        // Verify deployment
        console2.log("\n=== Deployment Verification ===");
        console2.log("Contract USDY:", address(locker.USDY()));
        console2.log("Contract Admin:", locker.admin());
        console2.log("Contract Paused:", locker.paused());
        console2.log("Total Locked:", locker.totalLocked());

        console2.log("\n=== Next Steps ===");
        console2.log("1. Update .env:");
        console2.log("   MANTLE_LOCKER=%s", address(locker));
        console2.log("2. Run FundWallets script to distribute test funds");
        console2.log("3. Run TestLock script to verify locking functionality");

        return locker;
    }
}
