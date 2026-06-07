// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {GuardedAccount} from "../../src/accounts/GuardedAccount.sol";
import {SpendingGuardLib} from "../../src/libraries/SpendingGuardLib.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

uint256 constant PER_TX = 2_000e6;
uint256 constant DAILY = 5_000e6;

/// @notice Drives a GuardedAccount with random spends (to an allowlisted merchant and to a
///         non-allowlisted attacker) and random time jumps, swallowing reverts so the fuzzer
///         explores freely. Ghost state records what actually went through.
contract GuardHandler is Test {
    GuardedAccount public account;
    MockUSDC public usdc;
    address public merchant;
    address public attacker;

    uint256 public maxSuccessfulSpend; // largest single merchant spend that the guard allowed

    constructor(GuardedAccount a, MockUSDC u, address m, address atk) {
        account = a;
        usdc = u;
        merchant = m;
        attacker = atk;
    }

    function spendMerchant(uint256 amount) external {
        amount = bound(amount, 0, 3_000e6); // straddles PER_TX so the cap gets exercised
        bytes memory data = abi.encodeCall(IERC20.transfer, (merchant, amount));
        try account.execute(address(usdc), 0, data) {
            if (amount > maxSuccessfulSpend) maxSuccessfulSpend = amount;
        } catch {}
    }

    function spendAttacker(uint256 amount) external {
        amount = bound(amount, 1, 3_000e6);
        bytes memory data = abi.encodeCall(IERC20.transfer, (attacker, amount));
        try account.execute(address(usdc), 0, data) {} catch {} // must always revert
    }

    function passTime(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 2 days)); // exercise the rolling-window reset
    }
}

/// @notice Invariants the SpendingGuard must hold no matter the order or timing of spends.
contract GuardInvariant is StdInvariant, Test {
    GuardedAccount account;
    GuardHandler handler;
    MockUSDC usdc;
    address merchant = makeAddr("merchant");
    address attacker = makeAddr("attacker");

    function setUp() public {
        usdc = new MockUSDC();
        // T2-like policy: $2k per-tx, $5k/day, not frozen.
        SpendingGuardLib.Config memory cfg =
            SpendingGuardLib.Config({perTxCap: PER_TX, dailyLimit: DAILY, frozen: false});
        account = new GuardedAccount(address(this), address(this), cfg); // owner = test, agent set below
        account.setAllowedDest(merchant, true); // attacker is deliberately NOT allowlisted

        usdc.mint(address(account), 100_000_000e6); // deep funding so reverts are policy, not balance

        handler = new GuardHandler(account, usdc, merchant, attacker);
        account.setAgent(address(handler)); // the handler drives the account as its agent

        targetContract(address(handler));
    }

    /// The drain target is never funded — the guard rejects every spend to a non-allowlisted dest.
    function invariant_attackerNeverFunded() public view {
        assertEq(usdc.balanceOf(attacker), 0);
    }

    /// Rolling-window spend never exceeds the daily limit, across any sequence + time warps.
    function invariant_windowSpentWithinDailyLimit() public view {
        (, uint256 spent) = account.windowState();
        assertLe(spent, DAILY);
    }

    /// No single allowed spend ever exceeded the per-tx cap.
    function invariant_singleSpendNeverExceedsCap() public view {
        assertLe(handler.maxSuccessfulSpend(), PER_TX);
    }
}
