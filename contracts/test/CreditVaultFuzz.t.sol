// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {CreditVault} from "../src/CreditVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

/// @notice The ERC-4626 inflation/donation attack: a first actor deposits 1 wei then donates a
///         large amount directly to the vault to skew the share price, so the next depositor
///         rounds down to 0 shares and is robbed. The virtual decimals-offset (6) plus the
///         dead-shares seed at deploy must make that impossible — the victim always keeps ~all
///         of their deposit.
contract CreditVaultFuzzTest is Test {
    MockUSDC usdc;
    CreditVault vault;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new CreditVault(IERC20(address(usdc)), "Swing Credit USDC", "scUSDC");
        // mirror Deploy.s.sol: seed dead shares (defense-in-depth atop the virtual offset)
        usdc.mint(address(this), 1e6);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1e6, address(0xdead));
    }

    function testFuzz_donationCannotStealDeposit(uint256 donation, uint256 deposit) public {
        donation = bound(donation, 0, 1_000_000e6);
        deposit = bound(deposit, 1e6, 1_000_000e6); // >= 1 USDC

        // attacker inflates the share price by donating straight into the vault (mints no shares)
        usdc.mint(address(this), donation);
        usdc.transfer(address(vault), donation);

        address victim = makeAddr("victim");
        usdc.mint(victim, deposit);
        vm.startPrank(victim);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(deposit, victim);
        vm.stopPrank();

        assertGt(shares, 0, "victim rounded to zero shares");
        // victim can redeem essentially all of their deposit back — no inflation theft
        uint256 recoverable = vault.previewRedeem(shares);
        assertGe(recoverable, deposit - deposit / 100 - 1, "victim lost value to donation");
    }
}
