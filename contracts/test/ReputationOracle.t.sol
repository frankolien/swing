// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";
import {IReputationOracle} from "../src/interfaces/IReputationOracle.sol";

contract ReputationOracleTest is Test {
    ReputationOracle oracle;
    address signer = makeAddr("signer");
    address stranger = makeAddr("stranger");
    uint256 constant AGENT = 42;

    event ReputationCommitted(
        uint256 indexed agentId, uint16 score, uint8 tier, uint32 epoch, bytes32 evidenceHash
    );

    function setUp() public {
        oracle = new ReputationOracle(signer);
    }

    function test_constructor_rejectsZeroSigner() public {
        vm.expectRevert(ReputationOracle.ZeroAddress.selector);
        new ReputationOracle(address(0));
    }

    function test_commit_setsScoreTierEpochAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit ReputationCommitted(AGENT, 800, 3, 1, bytes32("evi"));
        vm.prank(signer);
        oracle.commit(AGENT, 800, bytes32("evi"));

        IReputationOracle.Reputation memory r = oracle.getReputation(AGENT);
        assertEq(r.score, 800);
        assertEq(r.tier, 3);
        assertEq(r.epoch, 1);
        assertEq(r.evidenceHash, bytes32("evi"));
        assertEq(r.updatedAt, block.timestamp);
        assertEq(oracle.scoreOf(AGENT), 800);
        assertEq(oracle.tierOf(AGENT), 3);
    }

    function test_commit_epochMonotonic() public {
        vm.startPrank(signer);
        oracle.commit(AGENT, 300, bytes32(0));
        oracle.commit(AGENT, 600, bytes32(0));
        vm.stopPrank();
        assertEq(oracle.getReputation(AGENT).epoch, 2);
        assertEq(oracle.tierOf(AGENT), 2);
    }

    function test_commit_onlySigner() public {
        vm.expectRevert(ReputationOracle.NotSigner.selector);
        vm.prank(stranger);
        oracle.commit(AGENT, 500, bytes32(0));
    }

    function test_commit_scoreOutOfRange() public {
        vm.expectRevert(ReputationOracle.ScoreOutOfRange.selector);
        vm.prank(signer);
        oracle.commit(AGENT, 1001, bytes32(0));
    }

    function test_setSigner_rotatesAndGates() public {
        address newSigner = makeAddr("newSigner");
        oracle.setSigner(newSigner); // deployer is owner
        assertEq(oracle.signer(), newSigner);

        vm.expectRevert(ReputationOracle.NotSigner.selector);
        vm.prank(signer);
        oracle.commit(AGENT, 500, bytes32(0));

        vm.prank(newSigner);
        oracle.commit(AGENT, 500, bytes32(0));
        assertEq(oracle.scoreOf(AGENT), 500);
    }

    function test_setSigner_onlyOwner() public {
        vm.expectRevert(ReputationOracle.NotOwner.selector);
        vm.prank(stranger);
        oracle.setSigner(stranger);
    }
}
