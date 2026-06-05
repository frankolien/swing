// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// @title TierMath
/// @notice Single source of truth for the reputation -> credit curve. Pure; mirrored in
///         `packages/shared` for the engine and UI. Token amounts are in the vault asset's
///         smallest unit, assumed 6-decimal USDC (VAULT_ASSET_DECIMALS=6). Change here if
///         the asset's decimals change.
library TierMath {
    uint16 internal constant SCORE_MAX = 1000;

    // tier lower bounds (inclusive): T0 [0,250) T1 [250,500) T2 [500,750) T3 [750,1000]
    uint16 internal constant T1_MIN = 250;
    uint16 internal constant T2_MIN = 500;
    uint16 internal constant T3_MIN = 750;

    // credit curve: limit = BASE_LIMIT * (R/1000)^GAMMA, clamped to tierCap(tier)
    uint256 internal constant BASE_LIMIT = 50_000e6;
    int256 internal constant GAMMA_WAD = 1.5e18;

    function tierOf(uint16 score) internal pure returns (uint8) {
        if (score >= T3_MIN) return 3;
        if (score >= T2_MIN) return 2;
        if (score >= T1_MIN) return 1;
        return 0;
    }

    function tierCap(uint8 tier) internal pure returns (uint256) {
        if (tier == 3) return 50_000e6;
        if (tier == 2) return 10_000e6;
        if (tier == 1) return 1_000e6;
        return 100e6;
    }

    /// @notice Collateral factor in bps. Borrowing power = collateral * 1e4 / CF + allowance.
    ///         Lower tiers must over-collateralize; T3 borrows under-collateralized.
    function collateralFactorBps(uint8 tier) internal pure returns (uint16) {
        if (tier == 3) return 2000; // 20% — under
        if (tier == 2) return 5000; // 50% — partial
        if (tier == 1) return 10000; // 100% — fully
        return 15000; // 150% — over
    }

    function perTxCap(uint8 tier) internal pure returns (uint256) {
        if (tier == 3) return 10_000e6;
        if (tier == 2) return 2_000e6;
        if (tier == 1) return 250e6;
        return 25e6;
    }

    function dailyLimit(uint8 tier) internal pure returns (uint256) {
        if (tier == 3) return 25_000e6;
        if (tier == 2) return 5_000e6;
        if (tier == 1) return 500e6;
        return 50e6;
    }

    /// @notice limit = BASE_LIMIT * (score/1000)^1.5, clamped to the score's tierCap.
    ///         Super-linear so high reputation is meaningfully rewarded, never unbounded.
    function creditLimit(uint16 score) internal pure returns (uint256) {
        if (score == 0) return 0;
        uint16 s = score > SCORE_MAX ? SCORE_MAX : score;
        int256 xWad = int256(uint256(s) * 1e18 / 1000); // (s/1000) in WAD
        uint256 factor = uint256(FixedPointMathLib.powWad(xWad, GAMMA_WAD)); // ^1.5 in WAD
        uint256 limit = BASE_LIMIT * factor / 1e18;
        uint256 cap = tierCap(tierOf(s));
        return limit > cap ? cap : limit;
    }
}
