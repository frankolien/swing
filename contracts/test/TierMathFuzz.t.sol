// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {TierMath} from "../src/libraries/TierMath.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Property-based checks on the reputation -> credit curve. These are the economic
///         invariants the whole protocol leans on: more reputation never means less credit, and
///         the tier cap is a hard ceiling no score can exceed.
contract TierMathFuzzTest is Test {
    /// More reputation is never worth less credit (pairwise monotonicity, the strong form).
    function testFuzz_creditLimitMonotonic(uint16 a, uint16 b) public pure {
        a = uint16(bound(a, 0, TierMath.SCORE_MAX));
        b = uint16(bound(b, 0, TierMath.SCORE_MAX));
        if (a > b) (a, b) = (b, a); // a <= b
        assertLe(TierMath.creditLimit(a), TierMath.creditLimit(b));
    }

    /// The limit is always clamped to the score's tier cap — credit can never run unbounded.
    function testFuzz_creditLimitClampedToTierCap(uint16 score) public pure {
        score = uint16(bound(score, 0, TierMath.SCORE_MAX));
        uint256 limit = TierMath.creditLimit(score);
        assertLe(limit, TierMath.tierCap(TierMath.tierOf(score)));
        assertLe(limit, TierMath.BASE_LIMIT);
    }

    /// tierOf agrees with the documented bands for every score, including past SCORE_MAX.
    function testFuzz_tierMatchesBoundaries(uint16 score) public pure {
        uint8 tier = TierMath.tierOf(score);
        if (score >= 750) assertEq(tier, 3);
        else if (score >= 500) assertEq(tier, 2);
        else if (score >= 250) assertEq(tier, 1);
        else assertEq(tier, 0);
    }

    /// Tier caps, per-tx caps, daily limits, and collateral factors are all ordered by tier.
    function test_tierParametersOrdered() public pure {
        for (uint8 t = 0; t < 3; ++t) {
            assertLt(TierMath.tierCap(t), TierMath.tierCap(t + 1)); // higher tier, more credit
            assertLt(TierMath.perTxCap(t), TierMath.perTxCap(t + 1));
            assertLt(TierMath.dailyLimit(t), TierMath.dailyLimit(t + 1));
            // collateral factor DECREASES with tier (higher trust => less collateral needed)
            assertGt(TierMath.collateralFactorBps(t), TierMath.collateralFactorBps(t + 1));
        }
    }
}
