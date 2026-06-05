// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {GuardedAccountFactory} from "../src/accounts/GuardedAccountFactory.sol";
import {GuardedAccount} from "../src/accounts/GuardedAccount.sol";
import {SpendingGuardLib} from "../src/libraries/SpendingGuardLib.sol";

contract GuardedAccountFactoryTest is Test {
    GuardedAccountFactory factory;

    function setUp() public {
        factory = new GuardedAccountFactory();
    }

    function test_predictMatchesCreate() public {
        address owner = makeAddr("owner");
        address agent = makeAddr("agent");
        SpendingGuardLib.Config memory cfg =
            SpendingGuardLib.Config({perTxCap: 2_000e6, dailyLimit: 5_000e6, frozen: false});

        address predicted = factory.predict(1, owner, agent, cfg);
        address created = factory.createAccount(1, owner, agent, cfg);

        assertEq(created, predicted);
        assertEq(GuardedAccount(payable(created)).owner(), owner);
        assertEq(GuardedAccount(payable(created)).agent(), agent);
    }

    function test_distinctAgentsDistinctAccounts() public {
        SpendingGuardLib.Config memory cfg =
            SpendingGuardLib.Config({perTxCap: 0, dailyLimit: 0, frozen: false});
        address a = factory.createAccount(1, address(this), address(this), cfg);
        address b = factory.createAccount(2, address(this), address(this), cfg);
        assertTrue(a != b);
    }
}
