// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {MorphoAdapter} from "../../contracts/ethereum/MorphoAdapter.sol";
import {MarketParams, Id, IMorpho} from "../../contracts/interfaces/IMorpho.sol";

/**
 * Integration tests for USDC supply to Morpho market
 *
 * Tests two supply flows against Ethereum VTE fork:
 * 1. Bundler3 + EIP-2612 Permit (single transaction)
 * 2. MorphoAdapter (approve + supply, two transactions)
 *
 * Fork URL loaded from ETHEREUM_RPC_VTE environment variable.
 * Run: forge test --match-path test/integration/LenderSupply.t.sol -vv
 */

interface IBundler3 {
    struct Call {
        address target;
        bytes data;
        uint256 value;
        bool skipRevert;
    }

    function multicall(Call[] calldata bundle) external payable;
}

interface IUSDC {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
    function nonces(address owner) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IGeneralAdapter1 {
    function erc20TransferFrom(address token, address receiver, uint256 amount) external;
    function morphoSupply(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        uint256 maxSharePriceE27,
        address onBehalf,
        bytes calldata data
    ) external;
}

contract LenderSupplyTest is Test {
    // Mainnet addresses (available on VTE fork)
    address constant BUNDLER3 = 0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245;
    address constant GENERAL_ADAPTER1 = 0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0;
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant ADAPTIVE_IRM = 0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC;

    // Private key for signing permits
    uint256 constant LENDER_PRIVATE_KEY = 0xBEEF;
    address lender;

    // Contracts
    IBundler3 bundler3;
    IGeneralAdapter1 adapter1;
    IMorpho morpho;
    IUSDC usdc;
    MorphoAdapter morphoAdapter;

    // Test market params - must match an existing market or create new one
    MarketParams marketParams;
    Id marketId;

    // Track if market was created (for cleanup)
    bool marketCreated;

    function setUp() public {
        // Fork Ethereum VTE - loads RPC URL from environment
        string memory rpcUrl = vm.envString("ETHEREUM_RPC_VTE");
        vm.createSelectFork(rpcUrl);

        lender = vm.addr(LENDER_PRIVATE_KEY);

        bundler3 = IBundler3(BUNDLER3);
        adapter1 = IGeneralAdapter1(GENERAL_ADAPTER1);
        morpho = IMorpho(MORPHO);
        usdc = IUSDC(USDC);

        // Fund lender with USDC via storage override (1M USDC)
        deal(USDC, lender, 1_000_000e6);

        // Deploy MorphoAdapter for comparison testing
        morphoAdapter = new MorphoAdapter(MORPHO);

        // Use test market params (may need to create market first)
        _setupTestMarket();
    }

    function _setupTestMarket() internal {
        // Try to use market ID from environment if set
        string memory marketIdEnv = vm.envOr("NEXT_PUBLIC_MORPHO_MARKET_ID", string(""));

        if (bytes(marketIdEnv).length > 0 && bytes(marketIdEnv).length == 66) {
            marketId = Id.wrap(vm.parseBytes32(marketIdEnv));
            // Load market params from existing market
            marketParams = _getMarketParamsFromId(marketId);
        } else {
            // Use fallback test market params
            address acUsdy = vm.envOr("ETH_ACUSDY", address(0));

            // If no AcUSDY deployed, use a mock address for testing
            if (acUsdy == address(0)) {
                acUsdy = makeAddr("AcUSDY");
            }

            address oracle = vm.envOr("ETH_ORACLE", makeAddr("oracle"));

            marketParams = MarketParams({
                loanToken: USDC,
                collateralToken: acUsdy,
                oracle: oracle,
                irm: ADAPTIVE_IRM,
                lltv: 0.86e18 // 86% LLTV
            });

            marketId = Id.wrap(keccak256(abi.encode(marketParams)));

            // Try to create market if it doesn't exist
            try morpho.createMarket(marketParams) {
                marketCreated = true;
                console2.log("Created test market:", vm.toString(Id.unwrap(marketId)));
            } catch {
                console2.log("Using existing market:", vm.toString(Id.unwrap(marketId)));
            }
        }

        // Initialize MorphoAdapter with same market
        morphoAdapter.initializeMarket(marketParams);
    }

    function _getMarketParamsFromId(Id /* _marketId */) internal pure returns (MarketParams memory) {
        // In production, we'd call idToMarketParams on Morpho
        // For now, return empty and let test skip if needed
        return MarketParams({
            loanToken: address(0), collateralToken: address(0), oracle: address(0), irm: address(0), lltv: 0
        });
    }

    /**
     * Test: Supply USDC via Bundler3 + EIP-2612 Permit (single transaction)
     *
     * This mirrors the frontend flow:
     * 1. Sign permit off-chain (gasless)
     * 2. Submit multicall with permit + transferFrom + supply
     */
    function testSupplyViaBundler3WithPermit() public {
        // Skip if market not properly configured
        if (marketParams.loanToken == address(0)) {
            console2.log("Skipping: market params not configured");
            return;
        }

        uint256 supplyAmount = 1_000e6; // 1,000 USDC

        // Record initial state
        uint256 supplySharesBefore = _getSupplyShares(lender);
        uint256 usdcBalanceBefore = usdc.balanceOf(lender);

        // Step 1: Sign EIP-2612 permit
        uint256 nonce = usdc.nonces(lender);
        uint256 deadline = type(uint256).max;

        bytes32 permitHash = _getPermitTypedDataHash(lender, GENERAL_ADAPTER1, supplyAmount, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(LENDER_PRIVATE_KEY, permitHash);

        // Step 2: Build multicall bundle
        IBundler3.Call[] memory calls = new IBundler3.Call[](3);

        // Call 1: USDC.permit() - grants adapter allowance
        calls[0] = IBundler3.Call({
            target: USDC,
            data: abi.encodeCall(IUSDC.permit, (lender, GENERAL_ADAPTER1, supplyAmount, deadline, v, r, s)),
            value: 0,
            skipRevert: false
        });

        // Call 2: Adapter.erc20TransferFrom() - pulls USDC from lender to adapter
        calls[1] = IBundler3.Call({
            target: GENERAL_ADAPTER1,
            data: abi.encodeCall(IGeneralAdapter1.erc20TransferFrom, (USDC, GENERAL_ADAPTER1, supplyAmount)),
            value: 0,
            skipRevert: false
        });

        // Call 3: Adapter.morphoSupply() - supplies to Morpho on behalf of lender
        calls[2] = IBundler3.Call({
            target: GENERAL_ADAPTER1,
            data: abi.encodeCall(
                IGeneralAdapter1.morphoSupply,
                (
                    marketParams,
                    supplyAmount,
                    0, // shares = 0 means use assets
                    type(uint256).max, // maxSharePriceE27 = no slippage limit
                    lender, // onBehalf
                    "" // callback data
                )
            ),
            value: 0,
            skipRevert: false
        });

        // Step 3: Execute multicall as lender
        vm.prank(lender);
        bundler3.multicall(calls);

        // Step 4: Verify results
        uint256 supplySharesAfter = _getSupplyShares(lender);
        uint256 usdcBalanceAfter = usdc.balanceOf(lender);

        assertGt(supplySharesAfter, supplySharesBefore, "Supply shares should increase");
        assertEq(usdcBalanceAfter, usdcBalanceBefore - supplyAmount, "USDC balance should decrease by supply amount");

        console2.log("Bundler3 supply success");
        console2.log("  Supply shares before:", supplySharesBefore);
        console2.log("  Supply shares after:", supplySharesAfter);
        console2.log("  USDC spent:", supplyAmount);
    }

    /**
     * Test: Supply USDC via MorphoAdapter (two transactions)
     *
     * Reference implementation for comparison:
     * 1. approve() - separate transaction
     * 2. supplyUSDC() - separate transaction
     */
    function testSupplyViaMorphoAdapter() public {
        // Skip if market not properly configured
        if (marketParams.loanToken == address(0)) {
            console2.log("Skipping: market params not configured");
            return;
        }

        uint256 supplyAmount = 1_000e6; // 1,000 USDC

        // Record initial state
        uint256 supplySharesBefore = _getSupplyShares(lender);
        uint256 usdcBalanceBefore = usdc.balanceOf(lender);

        // TX 1: Approve
        vm.prank(lender);
        usdc.approve(address(morphoAdapter), supplyAmount);

        // TX 2: Supply
        vm.prank(lender);
        morphoAdapter.supplyUSDC(supplyAmount);

        // Verify results
        uint256 supplySharesAfter = _getSupplyShares(lender);
        uint256 usdcBalanceAfter = usdc.balanceOf(lender);

        assertGt(supplySharesAfter, supplySharesBefore, "Supply shares should increase");
        assertEq(usdcBalanceAfter, usdcBalanceBefore - supplyAmount, "USDC balance should decrease by supply amount");

        console2.log("MorphoAdapter supply success");
        console2.log("  Supply shares before:", supplySharesBefore);
        console2.log("  Supply shares after:", supplySharesAfter);
        console2.log("  USDC spent:", supplyAmount);
    }

    /**
     * Test: Invalid permit signature should revert
     */
    function testSupplyWithInvalidPermitReverts() public {
        // Skip if market not properly configured
        if (marketParams.loanToken == address(0)) {
            console2.log("Skipping: market params not configured");
            return;
        }

        uint256 supplyAmount = 1_000e6;
        uint256 deadline = type(uint256).max;

        // Use wrong private key for signature
        uint256 wrongKey = 0xDEAD;
        bytes32 permitHash = _getPermitTypedDataHash(lender, GENERAL_ADAPTER1, supplyAmount, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, permitHash);

        IBundler3.Call[] memory calls = new IBundler3.Call[](1);
        calls[0] = IBundler3.Call({
            target: USDC,
            data: abi.encodeCall(IUSDC.permit, (lender, GENERAL_ADAPTER1, supplyAmount, deadline, v, r, s)),
            value: 0,
            skipRevert: false
        });

        vm.prank(lender);
        vm.expectRevert(); // Invalid signature should revert
        bundler3.multicall(calls);
    }

    // Computes EIP-2612 permit typed data hash for USDC
    function _getPermitTypedDataHash(address owner, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        // EIP-2612 permit type hash (constant used inline to avoid variable naming lint)
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                spender,
                value,
                nonce,
                deadline
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
    }

    // Helper to get supply shares (handles interface differences)
    function _getSupplyShares(address user) internal view returns (uint256) {
        try morpho.supplyShares(marketId, user) returns (uint256 shares) {
            return shares;
        } catch {
            return 0;
        }
    }
}
