// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title SpendingGuardLib
/// @notice The spend-policy ladder, ported from agent_fuel's `policy.rs`. Pure check logic
///         over explicit storage state, reused by BOTH the ERC-7579 SpendingGuard module and
///         the direct GuardedAccount — so the rogue-tx revert does not depend on AA tooling.
///
///         Ladder order is load-bearing: it determines which typed error fires first.
///           1 frozen        kill switch is on
///           2 destination   payee is not on the allowlist
///           3 per-tx cap    single spend exceeds the tier cap
///           4 daily limit   rolling 24h spend would exceed the tier limit
///         The credit ceiling (how much capital exists) is enforced upstream by the
///         CreditManager; this guard governs where capital may go and how fast it leaves.
library SpendingGuardLib {
    struct Config {
        uint256 perTxCap; // 0 = unlimited
        uint256 dailyLimit; // 0 = unlimited
        bool frozen;
    }

    struct Window {
        uint64 start; // start of the rolling 24h window
        uint256 spent; // spent within the current window
    }

    uint256 internal constant DAY = 1 days;

    // reason codes returned by `preview` (and the order `enforce` reverts in)
    uint8 internal constant OK = 0;
    uint8 internal constant R_FROZEN = 1;
    uint8 internal constant R_DESTINATION = 2;
    uint8 internal constant R_PER_TX = 3;
    uint8 internal constant R_DAILY = 4;

    error Frozen();
    error DestinationNotAllowed(address dest);
    error PerTxCapExceeded(uint256 cap, uint256 amount);
    error DailyLimitExceeded(uint256 limit, uint256 windowSpent, uint256 amount);

    /// @notice Run the ladder and, on success, roll the window and record the spend.
    ///         Reverts with the first failing check's typed error.
    function enforce(
        Config storage cfg,
        Window storage win,
        bool destAllowed,
        address dest,
        uint256 amount,
        uint256 nowTs
    ) internal {
        if (cfg.frozen) revert Frozen();
        if (!destAllowed) revert DestinationNotAllowed(dest);
        if (cfg.perTxCap != 0 && amount > cfg.perTxCap) {
            revert PerTxCapExceeded(cfg.perTxCap, amount);
        }
        if (cfg.dailyLimit != 0) {
            uint256 spent = win.spent;
            if (nowTs - win.start >= DAY) {
                // block.timestamp fits uint64 for ~10^13 years
                // forge-lint: disable-next-line(unsafe-typecast)
                win.start = uint64(nowTs);
                spent = 0;
            }
            uint256 newSpent = spent + amount;
            if (newSpent > cfg.dailyLimit) {
                revert DailyLimitExceeded(cfg.dailyLimit, spent, amount);
            }
            win.spent = newSpent;
        }
    }

    /// @notice Read-only mirror of `enforce` for off-chain pre-flight and validation-phase
    ///         checks. Returns a reason code; never writes. Window roll is computed virtually.
    function preview(
        Config storage cfg,
        Window storage win,
        bool destAllowed,
        uint256 amount,
        uint256 nowTs
    ) internal view returns (uint8) {
        if (cfg.frozen) return R_FROZEN;
        if (!destAllowed) return R_DESTINATION;
        if (cfg.perTxCap != 0 && amount > cfg.perTxCap) return R_PER_TX;
        if (cfg.dailyLimit != 0) {
            uint256 spent = (nowTs - win.start >= DAY) ? 0 : win.spent;
            if (spent + amount > cfg.dailyLimit) return R_DAILY;
        }
        return OK;
    }
}
