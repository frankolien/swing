// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {GuardedAccount} from "../src/accounts/GuardedAccount.sol";
import {SpendingGuardLib} from "../src/libraries/SpendingGuardLib.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

/// @notice The rogue-tx revert beat, AA-independent. Exercises every rung of the ladder:
///         frozen -> destination -> per-tx cap -> rolling daily window.
contract GuardedAccountTest is Test {
    MockUSDC usdc;
    GuardedAccount acct;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address merchant = makeAddr("merchant"); // allowlisted payee
    address attacker = makeAddr("attacker"); // NOT allowlisted

    uint256 constant PER_TX = 2_000e6; // T2 defaults
    uint256 constant DAILY = 5_000e6;

    function setUp() public {
        usdc = new MockUSDC();
        acct = new GuardedAccount(
            owner,
            agent,
            SpendingGuardLib.Config({perTxCap: PER_TX, dailyLimit: DAILY, frozen: false})
        );
        vm.prank(owner);
        acct.setAllowedDest(merchant, true);
        usdc.mint(address(acct), 1_000_000e6);
    }

    function _transfer(address to, uint256 amt) internal pure returns (bytes memory) {
        return abi.encodeCall(IERC20.transfer, (to, amt));
    }

    // ── happy path ───────────────────────────────────────────────────────────────

    function test_allowedSpend_executesAndMetersWindow() public {
        vm.prank(agent);
        acct.execute(address(usdc), 0, _transfer(merchant, 1_000e6));

        assertEq(usdc.balanceOf(merchant), 1_000e6);
        (, uint256 spent) = acct.windowState();
        assertEq(spent, 1_000e6);
    }

    // ── the beat: a compromised key tries to drain the wallet ──────────────────────

    function test_rogue_destinationNotAllowed_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(SpendingGuardLib.DestinationNotAllowed.selector, attacker)
        );
        vm.prank(agent);
        acct.execute(address(usdc), 0, _transfer(attacker, 1_000e6));

        assertEq(usdc.balanceOf(attacker), 0); // funds never left
    }

    function test_rogue_perTxCapExceeded_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(SpendingGuardLib.PerTxCapExceeded.selector, PER_TX, 3_000e6)
        );
        vm.prank(agent);
        acct.execute(address(usdc), 0, _transfer(merchant, 3_000e6));
    }

    function test_rogue_dailyLimitExceeded_reverts() public {
        vm.startPrank(agent);
        acct.execute(address(usdc), 0, _transfer(merchant, 2_000e6));
        acct.execute(address(usdc), 0, _transfer(merchant, 2_000e6)); // window = 4,000
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingGuardLib.DailyLimitExceeded.selector, DAILY, 4_000e6, 2_000e6
            )
        );
        acct.execute(address(usdc), 0, _transfer(merchant, 2_000e6)); // would be 6,000 > 5,000
        vm.stopPrank();
    }

    function test_frozen_reverts() public {
        vm.prank(owner);
        acct.setFrozen(true);
        vm.expectRevert(SpendingGuardLib.Frozen.selector);
        vm.prank(agent);
        acct.execute(address(usdc), 0, _transfer(merchant, 100e6));
    }

    // ── window rolls after 24h ───────────────────────────────────────────────────

    function test_dailyWindow_resetsAfter24h() public {
        vm.startPrank(agent);
        acct.execute(address(usdc), 0, _transfer(merchant, 2_000e6));
        acct.execute(address(usdc), 0, _transfer(merchant, 2_000e6)); // window = 4,000 (near daily)
        vm.warp(block.timestamp + 1 days + 1);
        acct.execute(address(usdc), 0, _transfer(merchant, 2_000e6));
        acct.execute(address(usdc), 0, _transfer(merchant, 2_000e6)); // fresh window, allowed again
        vm.stopPrank();

        (, uint256 spent) = acct.windowState();
        assertEq(spent, 4_000e6); // only the post-reset spends count
        assertEq(usdc.balanceOf(merchant), 8_000e6);
    }

    function test_perTxCap_boundaryExactlyAtCapAllowed() public {
        vm.prank(agent);
        acct.execute(address(usdc), 0, _transfer(merchant, PER_TX)); // == cap is allowed
        assertEq(usdc.balanceOf(merchant), PER_TX);
    }

    // ── auth ───────────────────────────────────────────────────────────────────────

    function test_execute_onlyAgentOrOwner() public {
        vm.expectRevert(GuardedAccount.NotAuthorized.selector);
        vm.prank(attacker);
        acct.execute(address(usdc), 0, _transfer(merchant, 1e6));
    }

    function test_setAllowedDest_onlyOwner() public {
        vm.expectRevert(GuardedAccount.NotOwner.selector);
        vm.prank(agent);
        acct.setAllowedDest(attacker, true);
    }

    function test_ownerCanAlsoExecute() public {
        vm.prank(owner);
        acct.execute(address(usdc), 0, _transfer(merchant, 100e6));
        assertEq(usdc.balanceOf(merchant), 100e6);
    }

    // ── preview (off-chain pre-flight reason codes) ────────────────────────────────

    function test_previewSpend_reasonCodes() public {
        assertEq(acct.previewSpend(address(usdc), 0, _transfer(merchant, 1_000e6)), 0); // ok
        assertEq(acct.previewSpend(address(usdc), 0, _transfer(attacker, 1_000e6)), 2); // dest
        assertEq(acct.previewSpend(address(usdc), 0, _transfer(merchant, 3_000e6)), 3); // per-tx

        vm.prank(owner);
        acct.setFrozen(true);
        assertEq(acct.previewSpend(address(usdc), 0, _transfer(merchant, 1e6)), 1); // frozen
    }

    // ── native value path ──────────────────────────────────────────────────────────

    function test_nativeValue_meteredAgainstAllowlist() public {
        vm.deal(address(acct), 1 ether);
        vm.prank(agent);
        acct.execute(merchant, 1_000e6, ""); // native send to allowlisted dest, under cap
        assertEq(merchant.balance, 1_000e6);
    }

    function test_nativeValue_toAttackerReverts() public {
        vm.deal(address(acct), 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(SpendingGuardLib.DestinationNotAllowed.selector, attacker)
        );
        vm.prank(agent);
        acct.execute(attacker, 1_000e6, "");
    }
}
