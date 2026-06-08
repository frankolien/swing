// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {CreditVault} from "../src/CreditVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

contract CreditVaultTest is Test {
    MockUSDC usdc;
    CreditVault vault;
    address manager = makeAddr("manager");
    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new CreditVault(IERC20(address(usdc)), "Swing Credit USDC", "scUSDC");
        vault.setCreditManager(manager);
        usdc.mint(lender, 100_000e6);
        vm.prank(lender);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_setCreditManager_onlyOnce() public {
        vm.expectRevert(CreditVault.CreditManagerAlreadySet.selector);
        vault.setCreditManager(makeAddr("other"));
    }

    function test_deposit_andTotalAssets() public {
        vm.prank(lender);
        vault.deposit(50_000e6, lender);
        assertEq(vault.totalAssets(), 50_000e6);
        assertEq(vault.availableLiquidity(), 50_000e6);
        assertGt(vault.balanceOf(lender), 0);
    }

    function test_borrow_onlyCreditManager() public {
        vm.prank(lender);
        vault.deposit(50_000e6, lender);
        vm.expectRevert(CreditVault.NotCreditManager.selector);
        vault.borrow(borrower, 1_000e6);
    }

    function test_borrow_movesAssetsAndKeepsTotalAssetsFlat() public {
        vm.prank(lender);
        vault.deposit(50_000e6, lender);

        vm.prank(manager);
        vault.borrow(borrower, 10_000e6);

        assertEq(usdc.balanceOf(borrower), 10_000e6);
        assertEq(vault.totalBorrowed(), 10_000e6);
        assertEq(vault.availableLiquidity(), 40_000e6);
        assertEq(vault.totalAssets(), 50_000e6); // idle + borrowed unchanged on draw
    }

    function test_borrow_insufficientLiquidity() public {
        vm.prank(lender);
        vault.deposit(50_000e6, lender);
        vm.prank(manager);
        vm.expectRevert(CreditVault.InsufficientLiquidity.selector);
        vault.borrow(borrower, 60_000e6);
    }

    function test_repay_interestRaisesSharePrice() public {
        vm.prank(lender);
        vault.deposit(50_000e6, lender);
        uint256 shares = vault.balanceOf(lender);
        uint256 redeemBefore = vault.previewRedeem(shares);

        vm.prank(manager);
        vault.borrow(borrower, 10_000e6);

        // borrower repays principal + 500 interest (tokens go straight to the vault)
        usdc.mint(address(this), 10_500e6);
        usdc.transfer(address(vault), 10_500e6);
        vm.prank(manager);
        vault.onRepay(10_000e6);

        assertEq(vault.totalBorrowed(), 0);
        assertEq(vault.totalAssets(), 50_500e6); // interest accrued to the pool
        assertGt(vault.previewRedeem(shares), redeemBefore); // lenders earned yield
    }

    function test_writeOff_reducesBorrowed() public {
        vm.prank(lender);
        vault.deposit(50_000e6, lender);
        vm.prank(manager);
        vault.borrow(borrower, 10_000e6);

        vm.prank(manager);
        vault.writeOff(10_000e6);
        assertEq(vault.totalBorrowed(), 0);
        assertEq(vault.totalAssets(), 40_000e6); // lenders absorbed the loss
    }

    /// @notice Inflation/donation attack: a front-running attacker cannot round the victim's
    ///         deposit to zero shares thanks to the virtual-shares offset.
    function test_inflationAttack_victimProtected() public {
        address attacker = makeAddr("attacker");
        address victim = makeAddr("victim");
        usdc.mint(attacker, 10_001e6);
        usdc.mint(victim, 10_000e6);

        vm.startPrank(attacker);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1, attacker); // 1 unit
        usdc.transfer(address(vault), 10_000e6); // donate to inflate
        vm.stopPrank();

        vm.startPrank(victim);
        usdc.approve(address(vault), type(uint256).max);
        uint256 vShares = vault.deposit(10_000e6, victim);
        vm.stopPrank();

        assertGt(vShares, 0);
        assertGe(vault.previewRedeem(vShares), 9_900e6); // recovers ~all of the deposit
    }
}
