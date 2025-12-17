// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/**
 * Distributes MNT and USDY from the admin treasury to operational wallets
 * Enables separation of concerns: admin controls contracts, borrower tests flows, DVNs sign attestations
 *
 * Funding strategy:
 * - Borrower: Needs substantial USDY for locking tests
 * - DVNs: Only need gas (MNT) for signing transactions
 * - Lender: Reserved for Morpho interactions
 */
contract FundWallets is Script {
    error MntTransferFailed(address to, uint256 amount);
    error UsdyTransferFailed(address to, uint256 amount);

    /// Token amounts scaled to proper decimals
    uint256 constant BORROWER_USDY_AMOUNT = 100 ether; // 100 USDY (18 decimals)
    uint256 constant BORROWER_MNT_AMOUNT = 1 ether; // 1 MNT for gas
    uint256 constant DVN_MNT_AMOUNT = 0.1 ether; // 0.1 MNT each (DVNs only sign, don't transfer tokens)
    uint256 constant LENDER_MNT_AMOUNT = 5 ether; // 5 MNT for operations

    function run() external {
        HelperConfig config = new HelperConfig();
        HelperConfig.MantleConfig memory mantleConfig = config.getMantleVteConfig();

        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address borrower = vm.envAddress("BORROWER_ADDRESS");
        address dvn1 = vm.envAddress("DVN1_ADDRESS");
        address dvn2 = vm.envAddress("DVN2_ADDRESS");
        address dvn3 = vm.envAddress("DVN3_ADDRESS");
        address lender = vm.envAddress("LENDER_ADDRESS");

        IERC20 usdy = IERC20(mantleConfig.usdy);

        console2.log("=== Funding Wallets on Mantle VTE ===");
        console2.log("Admin (Treasury):", mantleConfig.admin);

        vm.startBroadcast(deployerPrivateKey);

        // Fund borrower with both MNT and USDY
        console2.log("\n[1/5] Funding Borrower:", borrower);
        _transferMnt(borrower, BORROWER_MNT_AMOUNT);
        _transferUsdy(usdy, borrower, BORROWER_USDY_AMOUNT);

        // Fund DVN signers with MNT only (they don't handle tokens, just sign messages)
        console2.log("\n[2/5] Funding DVN1:", dvn1);
        _transferMnt(dvn1, DVN_MNT_AMOUNT);

        console2.log("\n[3/5] Funding DVN2:", dvn2);
        _transferMnt(dvn2, DVN_MNT_AMOUNT);

        console2.log("\n[4/5] Funding DVN3:", dvn3);
        _transferMnt(dvn3, DVN_MNT_AMOUNT);

        // Fund lender (Morpho USDC operations)
        console2.log("\n[5/5] Funding Lender:", lender);
        _transferMnt(lender, LENDER_MNT_AMOUNT);

        vm.stopBroadcast();

        console2.log("\n=== Funding Complete ===");
        _logBalances(usdy, mantleConfig.admin, borrower, dvn1, dvn2, dvn3, lender);
    }

    /**
     * Transfer native MNT tokens for gas
     * Uses low-level call to handle potential failures gracefully
     */
    function _transferMnt(address to, uint256 amount) internal {
        (bool success,) = payable(to).call{value: amount}("");
        if (!success) revert MntTransferFailed(to, amount);
        console2.log("  Transferred %s MNT", amount / 1 ether);
    }

    /**
     * Transfer USDY tokens
     * Assumes admin has already approved or owns sufficient USDY
     */
    function _transferUsdy(IERC20 usdy, address to, uint256 amount) internal {
        bool success = usdy.transfer(to, amount);
        if (!success) revert UsdyTransferFailed(to, amount);
        console2.log("  Transferred %s USDY", amount / 1 ether);
    }

    /**
     * Display final balance state for verification
     * Critical for debugging Tenderly VTE state
     */
    function _logBalances(
        IERC20 usdy,
        address admin,
        address borrower,
        address dvn1,
        address dvn2,
        address dvn3,
        address lender
    ) internal view {
        console2.log("\nFinal Balances:");
        console2.log("Admin MNT:", admin.balance / 1 ether, "| USDY:", usdy.balanceOf(admin) / 1 ether);
        console2.log("Borrower MNT:", borrower.balance / 1 ether, "| USDY:", usdy.balanceOf(borrower) / 1 ether);
        console2.log("DVN1 MNT:", dvn1.balance / 1 ether);
        console2.log("DVN2 MNT:", dvn2.balance / 1 ether);
        console2.log("DVN3 MNT:", dvn3.balance / 1 ether);
        console2.log("Lender MNT:", lender.balance / 1 ether);
    }
}
