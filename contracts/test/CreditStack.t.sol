// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";
import {IReputationOracle} from "../src/interfaces/IReputationOracle.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {ICreditVault} from "../src/interfaces/ICreditVault.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {TierMath} from "../src/libraries/TierMath.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice End-to-end credit flow: reputation -> tier -> limit -> draw -> repay -> liquidate.
contract CreditStackTest is Test {
    MockUSDC usdc;
    ReputationOracle oracle;
    CreditVault vault;
    CreditManager manager;

    address signer = makeAddr("signer");
    address lender = makeAddr("lender");
    address account = makeAddr("agentAccount"); // the agent's smart account
    uint256 constant AGENT = 1;

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new ReputationOracle(signer);
        vault = new CreditVault(IERC20(address(usdc)), "Swing Credit USDC", "scUSDC");
        manager = new CreditManager(IReputationOracle(address(oracle)), ICreditVault(address(vault)));
        vault.setCreditManager(address(manager));

        usdc.mint(lender, 200_000e6);
        vm.startPrank(lender);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(200_000e6, lender);
        vm.stopPrank();
    }

    function _commit(uint16 score) internal {
        vm.prank(signer);
        oracle.commit(AGENT, score, bytes32(0));
    }

    function test_openLine_noLineErrors() public {
        vm.expectRevert(CreditManager.NoLine.selector);
        manager.draw(AGENT, 1);
    }

    function test_openLine_zeroAccountReverts() public {
        vm.expectRevert(CreditManager.ZeroAddress.selector);
        manager.openLine(AGENT, address(0));
    }

    function test_openLine_alreadyOpen() public {
        manager.openLine(AGENT, account);
        vm.expectRevert(CreditManager.AlreadyOpen.selector);
        manager.openLine(AGENT, account);
    }

    function test_t3_drawsUncollateralizedUpToLimit() public {
        _commit(800);
        manager.openLine(AGENT, account);
        uint256 limit = TierMath.creditLimit(800);
        assertEq(manager.borrowingPower(AGENT), limit); // T3 allowance == full limit

        manager.draw(AGENT, limit);
        assertEq(usdc.balanceOf(account), limit); // disbursed only to the registered account
        assertEq(manager.debtOf(AGENT), limit);
    }

    function test_draw_overLimitReverts() public {
        _commit(800);
        manager.openLine(AGENT, account);
        uint256 power = manager.borrowingPower(AGENT);
        vm.expectRevert(
            abi.encodeWithSelector(CreditManager.OverLimit.selector, power, power + 1)
        );
        manager.draw(AGENT, power + 1);
    }

    function test_draw_disbursesOnlyToRegisteredAccount() public {
        _commit(800);
        manager.openLine(AGENT, account);
        manager.draw(AGENT, 1_000e6);
        assertEq(usdc.balanceOf(account), 1_000e6);
        assertEq(usdc.balanceOf(address(this)), 0); // caller never receives funds
    }

    /// @notice The headline: R crosses 750 and the on-chain credit line jumps.
    function test_refreshLimit_crossing750RaisesLine() public {
        _commit(700); // T2
        manager.openLine(AGENT, account);
        CreditManager.Line memory l0 = manager.getLine(AGENT);
        assertEq(l0.tier, 2);
        assertEq(l0.limit, 10_000e6); // T2 clamp
        assertEq(manager.borrowingPower(AGENT), 5_000e6); // T2 allowance = limit/2

        _commit(800); // T3
        manager.refreshLimit(AGENT);
        CreditManager.Line memory l1 = manager.getLine(AGENT);
        assertEq(l1.tier, 3);
        assertGt(l1.limit, l0.limit); // line raised
        assertEq(manager.borrowingPower(AGENT), l1.limit); // and now fully uncollateralized
    }

    function test_t1_requiresCollateral() public {
        _commit(300); // T1, no uncollateralized allowance
        manager.openLine(AGENT, account);
        assertEq(manager.borrowingPower(AGENT), 0);
        vm.expectRevert(); // OverLimit(0, amount)
        manager.draw(AGENT, 100e6);

        // post collateral, then draw against it (CF 100%)
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(manager), type(uint256).max);
        manager.postCollateral(AGENT, 1_000e6);
        assertEq(manager.borrowingPower(AGENT), 1_000e6);
        manager.draw(AGENT, 1_000e6);
        assertEq(usdc.balanceOf(account), 1_000e6);
    }

    function test_repay_interestFirstThenPrincipal() public {
        _commit(800);
        manager.openLine(AGENT, account);
        manager.draw(AGENT, 10_000e6);

        vm.warp(block.timestamp + 365 days); // accrue ~1y interest
        uint256 debt = manager.debtOf(AGENT);
        assertGt(debt, 10_000e6);
        uint256 interest = debt - 10_000e6;

        // account repays full debt; approve the manager, tokens flow to the vault
        usdc.mint(account, interest); // top up to cover interest beyond the drawn principal
        vm.startPrank(account);
        usdc.approve(address(manager), type(uint256).max);
        manager.repay(AGENT, debt);
        vm.stopPrank();

        assertApproxEqAbs(manager.debtOf(AGENT), 0, 1);
        assertEq(vault.totalBorrowed(), 0);
        assertGe(vault.totalAssets(), 200_000e6 + interest - 1); // lenders earned the interest
    }

    function test_repay_nothingToRepay() public {
        _commit(800);
        manager.openLine(AGENT, account);
        vm.expectRevert(CreditManager.NothingToRepay.selector);
        manager.repay(AGENT, 1);
    }

    function test_repay_capsAtDebt() public {
        _commit(800);
        manager.openLine(AGENT, account);
        manager.draw(AGENT, 5_000e6);

        // try to over-repay; only the outstanding debt is pulled
        usdc.mint(account, 5_000e6);
        vm.startPrank(account);
        usdc.approve(address(manager), type(uint256).max);
        uint256 balBefore = usdc.balanceOf(account);
        manager.repay(AGENT, 9_999e6);
        vm.stopPrank();

        assertEq(manager.debtOf(AGENT), 0);
        assertEq(balBefore - usdc.balanceOf(account), 5_000e6); // only debt amount moved
    }

    function test_liquidate_seizesCollateralWritesOffAndDemotesLine() public {
        _commit(300); // T1
        manager.openLine(AGENT, account);
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(manager), type(uint256).max);
        manager.postCollateral(AGENT, 1_000e6);
        manager.draw(AGENT, 1_000e6);

        uint256 borrowedBefore = vault.totalBorrowed();
        manager.liquidate(AGENT); // deployer is owner

        CreditManager.Line memory l = manager.getLine(AGENT);
        assertTrue(l.liquidated);
        assertEq(l.principal, 0);
        assertEq(l.collateral, 0);
        assertEq(vault.totalBorrowed(), borrowedBefore - 1_000e6); // principal written off
        assertEq(manager.borrowingPower(AGENT), 0); // line dead
    }

    function test_liquidate_onlyOwner() public {
        _commit(800);
        manager.openLine(AGENT, account);
        vm.expectRevert();
        vm.prank(makeAddr("stranger"));
        manager.liquidate(AGENT);
    }

    function test_draw_afterLiquidationReverts() public {
        _commit(800);
        manager.openLine(AGENT, account);
        manager.draw(AGENT, 1_000e6);
        manager.liquidate(AGENT);
        vm.expectRevert(CreditManager.LineLiquidated.selector);
        manager.draw(AGENT, 1);
    }
}
