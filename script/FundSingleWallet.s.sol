// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/**
 * Funds a single wallet with MNT and USDY
 * Used by the web frontend to fund users on demand
 * 
 * Usage:
 * forge script script/FundSingleWallet.s.sol:FundSingleWallet \
 *   --rpc-url "$MANTLE_RPC_VTE" --broadcast --legacy \
 *   --sig "run(address)" <TARGET_ADDRESS>
 */
contract FundSingleWallet is Script {
    /// Token amounts scaled to proper decimals
    uint256 constant USDY_AMOUNT = 100 ether; // 100 USDY (18 decimals)
    uint256 constant MNT_AMOUNT = 1 ether; // 1 MNT for gas

    function run(address target) external {
        require(target != address(0), "Invalid target address");
        
        HelperConfig config = new HelperConfig();
        HelperConfig.MantleConfig memory mantleConfig = config.getMantleVteConfig();

        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        IERC20 usdy = IERC20(mantleConfig.usdy);

        console2.log("=== Funding Single Wallet on Mantle VTE ===");
        console2.log("Admin (Treasury):", mantleConfig.admin);
        console2.log("Target Wallet:", target);

        vm.startBroadcast(deployerPrivateKey);

        // Transfer MNT for gas
        (bool mntSuccess,) = payable(target).call{value: MNT_AMOUNT}("");
        require(mntSuccess, "MNT transfer failed");
        console2.log("Transferred %s MNT", MNT_AMOUNT / 1 ether);

        // Transfer USDY
        bool usdySuccess = usdy.transfer(target, USDY_AMOUNT);
        require(usdySuccess, "USDY transfer failed");
        console2.log("Transferred %s USDY", USDY_AMOUNT / 1 ether);

        vm.stopBroadcast();

        console2.log("\n=== Funding Complete ===");
        console2.log("Target MNT Balance:", target.balance / 1 ether);
        console2.log("Target USDY Balance:", usdy.balanceOf(target) / 1 ether);
    }
}
