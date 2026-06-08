// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {TierMath} from "../src/libraries/TierMath.sol";
import {Test} from "forge-std/Test.sol";

contract TierMathTest is Test {
    function test_tierBoundaries() public pure {
        assertEq(TierMath.tierOf(0), 0);
        assertEq(TierMath.tierOf(249), 0);
        assertEq(TierMath.tierOf(250), 1);
        assertEq(TierMath.tierOf(499), 1);
        assertEq(TierMath.tierOf(500), 2);
        assertEq(TierMath.tierOf(749), 2);
        assertEq(TierMath.tierOf(750), 3);
        assertEq(TierMath.tierOf(1000), 3);
    }

    function test_creditLimit_zeroAndCaps() public pure {
        assertEq(TierMath.creditLimit(0), 0);
        assertEq(TierMath.creditLimit(1000), 50_000e6); // exactly the T3 cap at R=1000
        assertLe(TierMath.creditLimit(750), 50_000e6); // never exceeds the band
    }

    /// @notice The demo beat: crossing R=750 lifts the line out of the T2 clamp.
    function test_creditLimit_crossing750RaisesLine() public pure {
        uint256 at749 = TierMath.creditLimit(749);
        uint256 at750 = TierMath.creditLimit(750);
        assertEq(at749, 10_000e6); // clamped to the T2 cap
        assertGt(at750, at749); // T3 curve is well above the T2 cap
    }

    function test_creditLimit_monotonicNonDecreasing() public pure {
        uint256 prev;
        for (uint16 s = 0; s <= 1000; s += 25) {
            uint256 l = TierMath.creditLimit(s);
            assertGe(l, prev);
            prev = l;
        }
    }

    function test_collateralFactors() public pure {
        assertEq(TierMath.collateralFactorBps(0), 15000);
        assertEq(TierMath.collateralFactorBps(1), 10000);
        assertEq(TierMath.collateralFactorBps(2), 5000);
        assertEq(TierMath.collateralFactorBps(3), 2000);
    }

    function test_perTxAndDailyDefaults() public pure {
        assertEq(TierMath.perTxCap(0), 25e6);
        assertEq(TierMath.perTxCap(3), 10_000e6);
        assertEq(TierMath.dailyLimit(0), 50e6);
        assertEq(TierMath.dailyLimit(3), 25_000e6);
    }

    function testFuzz_creditLimitNeverExceedsCap(uint16 score) public pure {
        uint256 limit = TierMath.creditLimit(score);
        assertLe(limit, TierMath.tierCap(TierMath.tierOf(score > 1000 ? 1000 : score)));
    }
}
