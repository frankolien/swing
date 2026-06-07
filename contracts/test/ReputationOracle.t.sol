// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ReputationOracle} from "../src/ReputationOracle.sol";
import {IReputationOracle} from "../src/interfaces/IReputationOracle.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Test} from "forge-std/Test.sol";

contract ReputationOracleTest is Test {
    ReputationOracle oracle;

    // a 2-of-3 committee
    uint256 pk1;
    uint256 pk2;
    uint256 pk3;
    address s1;
    address s2;
    address s3;
    address stranger;
    uint256 strangerPk;
    uint256 constant AGENT = 42;

    event ReputationCommitted(
        uint256 indexed agentId, uint16 score, uint8 tier, uint32 epoch, bytes32 evidenceHash
    );

    function setUp() public {
        (s1, pk1) = makeAddrAndKey("signer1");
        (s2, pk2) = makeAddrAndKey("signer2");
        (s3, pk3) = makeAddrAndKey("signer3");
        (stranger, strangerPk) = makeAddrAndKey("stranger");
        oracle = new ReputationOracle(_three(s1, s2, s3), 2); // 2-of-3
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────

    function _three(address a, address b, address c) internal pure returns (address[] memory out) {
        out = new address[](3);
        out[0] = a;
        out[1] = b;
        out[2] = c;
    }

    function _one(address a) internal pure returns (address[] memory out) {
        out = new address[](1);
        out[0] = a;
    }

    /// Build the signatures array for a commit, sorted ascending by signer address (as the
    /// contract requires). `pks` are the committee keys that should sign.
    function _sigs(uint256 agent, uint16 score, bytes32 evi, uint256[] memory pks)
        internal
        view
        returns (bytes[] memory)
    {
        bytes32 ethHash =
            MessageHashUtils.toEthSignedMessageHash(oracle.commitDigest(agent, score, evi));
        address[] memory addrs = new address[](pks.length);
        bytes[] memory sigs = new bytes[](pks.length);
        for (uint256 i; i < pks.length; ++i) {
            addrs[i] = vm.addr(pks[i]);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(pks[i], ethHash);
            sigs[i] = abi.encodePacked(r, s, v);
        }
        // insertion sort by recovered address (ascending)
        for (uint256 i = 1; i < pks.length; ++i) {
            for (uint256 j = i; j > 0 && addrs[j - 1] > addrs[j]; --j) {
                (addrs[j - 1], addrs[j]) = (addrs[j], addrs[j - 1]);
                (sigs[j - 1], sigs[j]) = (sigs[j], sigs[j - 1]);
            }
        }
        return sigs;
    }

    function _pks(uint256 a, uint256 b) internal pure returns (uint256[] memory out) {
        out = new uint256[](2);
        out[0] = a;
        out[1] = b;
    }

    function _pks1(uint256 a) internal pure returns (uint256[] memory out) {
        out = new uint256[](1);
        out[0] = a;
    }

    function _commit2(uint256 agent, uint16 score, bytes32 evi) internal {
        oracle.commit(agent, score, evi, _sigs(agent, score, evi, _pks(pk1, pk2)));
    }

    // ── constructor ───────────────────────────────────────────────────────────────

    function test_constructor_setsCommittee() public view {
        assertEq(oracle.signerCount(), 3);
        assertEq(oracle.threshold(), 2);
        assertTrue(oracle.isSigner(s1));
        assertTrue(oracle.isSigner(s2));
        assertTrue(oracle.isSigner(s3));
        assertFalse(oracle.isSigner(stranger));
        assertEq(oracle.owner(), address(this));
    }

    function test_constructor_rejectsZeroThreshold() public {
        vm.expectRevert(ReputationOracle.InvalidThreshold.selector);
        new ReputationOracle(_one(s1), 0);
    }

    function test_constructor_rejectsThresholdAboveN() public {
        vm.expectRevert(ReputationOracle.InvalidThreshold.selector);
        new ReputationOracle(_one(s1), 2);
    }

    function test_constructor_rejectsZeroSigner() public {
        vm.expectRevert(ReputationOracle.ZeroAddress.selector);
        new ReputationOracle(_one(address(0)), 1);
    }

    function test_constructor_rejectsDuplicateSigner() public {
        vm.expectRevert(abi.encodeWithSelector(ReputationOracle.DuplicateSigner.selector, s1));
        new ReputationOracle(_three(s1, s1, s2), 2);
    }

    // ── commit ──────────────────────────────────────────────────────────────────────

    function test_commit_quorumSetsScoreTierEpochAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit ReputationCommitted(AGENT, 800, 3, 1, bytes32("evi"));
        _commit2(AGENT, 800, bytes32("evi"));

        IReputationOracle.Reputation memory r = oracle.getReputation(AGENT);
        assertEq(r.score, 800);
        assertEq(r.tier, 3);
        assertEq(r.epoch, 1);
        assertEq(r.evidenceHash, bytes32("evi"));
        assertEq(r.updatedAt, block.timestamp);
        assertEq(oracle.scoreOf(AGENT), 800);
        assertEq(oracle.tierOf(AGENT), 3);
    }

    function test_commit_anyTwoOfThreeWork() public {
        // s2 + s3 (not the "first" two) — quorum is about count, not identity
        oracle.commit(AGENT, 500, bytes32(0), _sigs(AGENT, 500, bytes32(0), _pks(pk2, pk3)));
        assertEq(oracle.scoreOf(AGENT), 500);
        assertEq(oracle.tierOf(AGENT), 2);
    }

    function test_commit_permissionlessSubmitter() public {
        // a non-signer submits the tx; the quorum's signatures carry the authority
        vm.prank(stranger);
        _commit2(AGENT, 600, bytes32(0));
        assertEq(oracle.scoreOf(AGENT), 600);
    }

    function test_commit_epochMonotonic() public {
        _commit2(AGENT, 300, bytes32(0));
        _commit2(AGENT, 600, bytes32(0));
        assertEq(oracle.getReputation(AGENT).epoch, 2);
        assertEq(oracle.tierOf(AGENT), 2);
    }

    function test_commit_belowThresholdReverts() public {
        uint256[] memory one = _pks1(pk1);
        bytes[] memory sigs = _sigs(AGENT, 500, bytes32(0), one);
        vm.expectRevert(abi.encodeWithSelector(ReputationOracle.NotEnoughSignatures.selector, 1, 2));
        oracle.commit(AGENT, 500, bytes32(0), sigs);
    }

    function test_commit_unauthorizedSignerReverts() public {
        bytes[] memory sigs = _sigs(AGENT, 500, bytes32(0), _pks(pk1, strangerPk));
        vm.expectRevert(); // UnauthorizedSigner(stranger) or SignaturesNotSorted depending on order
        oracle.commit(AGENT, 500, bytes32(0), sigs);
    }

    function test_commit_duplicateSignerReverts() public {
        // same signer twice — not strictly ascending
        bytes[] memory sigs = _sigs(AGENT, 500, bytes32(0), _pks(pk1, pk1));
        vm.expectRevert(ReputationOracle.SignaturesNotSorted.selector);
        oracle.commit(AGENT, 500, bytes32(0), sigs);
    }

    function test_commit_unsortedSignaturesRevert() public {
        // hand the contract a deliberately mis-ordered set (descending)
        bytes32 evi = bytes32(0);
        bytes[] memory sorted = _sigs(AGENT, 500, evi, _pks(pk1, pk2));
        bytes[] memory rev = new bytes[](2);
        rev[0] = sorted[1];
        rev[1] = sorted[0];
        vm.expectRevert(ReputationOracle.SignaturesNotSorted.selector);
        oracle.commit(AGENT, 500, evi, rev);
    }

    function test_commit_replayReverts() public {
        bytes[] memory sigs = _sigs(AGENT, 500, bytes32(0), _pks(pk1, pk2));
        oracle.commit(AGENT, 500, bytes32(0), sigs); // epoch 1 — ok
        // reusing the same signatures now hashes against epoch 2 → recovers non-signers → revert
        vm.expectRevert();
        oracle.commit(AGENT, 500, bytes32(0), sigs);
    }

    function test_commit_scoreOutOfRange() public {
        bytes[] memory sigs = _sigs(AGENT, 1001, bytes32(0), _pks(pk1, pk2));
        vm.expectRevert(ReputationOracle.ScoreOutOfRange.selector);
        oracle.commit(AGENT, 1001, bytes32(0), sigs);
    }

    function testFuzz_anyTwoSignersFormQuorum(bool useS1, bool useS2, uint16 rawScore) public {
        uint16 score = uint16(bound(rawScore, 0, 1000));
        // pick two distinct signers based on the fuzzed flags
        uint256 a = useS1 ? pk1 : pk3;
        uint256 b = useS2 ? pk2 : pk3;
        if (a == b) b = (a == pk3) ? pk1 : pk3; // ensure distinct
        oracle.commit(AGENT, score, bytes32("f"), _sigs(AGENT, score, bytes32("f"), _pks(a, b)));
        assertEq(oracle.scoreOf(AGENT), score);
    }

    // ── committee management ──────────────────────────────────────────────────────

    function test_addSigner_growsCommittee() public {
        address s4 = makeAddr("signer4");
        oracle.addSigner(s4);
        assertTrue(oracle.isSigner(s4));
        assertEq(oracle.signerCount(), 4);
    }

    function test_addSigner_onlyOwner() public {
        vm.expectRevert(ReputationOracle.NotOwner.selector);
        vm.prank(stranger);
        oracle.addSigner(stranger);
    }

    function test_addSigner_rejectsDuplicate() public {
        vm.expectRevert(abi.encodeWithSelector(ReputationOracle.DuplicateSigner.selector, s1));
        oracle.addSigner(s1);
    }

    function test_removeSigner_shrinksCommittee() public {
        oracle.removeSigner(s3); // 3 -> 2, threshold still 2 (ok)
        assertFalse(oracle.isSigner(s3));
        assertEq(oracle.signerCount(), 2);
    }

    function test_removeSigner_cannotDropBelowThreshold() public {
        oracle.removeSigner(s3); // now 2 signers, threshold 2
        vm.expectRevert(ReputationOracle.InvalidThreshold.selector);
        oracle.removeSigner(s2); // would leave 1 < threshold 2
    }

    function test_removeSigner_unknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ReputationOracle.UnknownSigner.selector, stranger));
        oracle.removeSigner(stranger);
    }

    function test_setThreshold_updates() public {
        oracle.setThreshold(3);
        assertEq(oracle.threshold(), 3);
        // now needs all three
        oracle.commit(AGENT, 700, bytes32(0), _sigs(AGENT, 700, bytes32(0), _three3(pk1, pk2, pk3)));
        assertEq(oracle.scoreOf(AGENT), 700);
    }

    function test_setThreshold_rejectsAboveCount() public {
        vm.expectRevert(ReputationOracle.InvalidThreshold.selector);
        oracle.setThreshold(4);
    }

    function test_setThreshold_rejectsZero() public {
        vm.expectRevert(ReputationOracle.InvalidThreshold.selector);
        oracle.setThreshold(0);
    }

    function test_setThreshold_onlyOwner() public {
        vm.expectRevert(ReputationOracle.NotOwner.selector);
        vm.prank(stranger);
        oracle.setThreshold(1);
    }

    function test_transferOwnership() public {
        oracle.transferOwnership(stranger);
        assertEq(oracle.owner(), stranger);
        vm.expectRevert(ReputationOracle.NotOwner.selector);
        oracle.addSigner(makeAddr("x"));
    }

    function _three3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory out) {
        out = new uint256[](3);
        out[0] = a;
        out[1] = b;
        out[2] = c;
    }
}
