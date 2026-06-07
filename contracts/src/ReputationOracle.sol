// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IReputationOracle} from "./interfaces/IReputationOracle.sol";
import {TierMath} from "./libraries/TierMath.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title ReputationOracle
/// @notice The swing-native fast read of an agent's score. The engine computes the heavy,
///         recency-decayed, Sybil-gated R off-chain and commits the result here; `evidenceHash`
///         binds the commit to its inputs so anyone can recompute and audit.
///
///         Writes are gated by a k-of-n SIGNER COMMITTEE rather than a single key: a commit
///         needs `threshold` signatures from distinct, owner-authorized signers over a digest
///         bound to (chainId, this oracle, agentId, score, evidenceHash, nextEpoch). No single
///         key can fabricate a score, and a quorum's signatures cannot be replayed across
///         chains, deployments, or epochs. Submitting the tx is permissionless — only the
///         signatures carry authority — so the gas payer need not be a committee member.
contract ReputationOracle is IReputationOracle {
    mapping(uint256 agentId => Reputation) private _rep;

    address public owner;
    mapping(address => bool) public isSigner;
    uint256 public signerCount;
    uint256 public threshold;

    error NotOwner();
    error ZeroAddress();
    error DuplicateSigner(address signer);
    error UnknownSigner(address signer);
    error InvalidThreshold();
    error ScoreOutOfRange();
    error SignaturesNotSorted(); // also catches duplicates: signers must strictly ascend
    error UnauthorizedSigner(address recovered);
    error NotEnoughSignatures(uint256 provided, uint256 required);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param signers_ the initial committee (distinct, non-zero)
    /// @param threshold_ signatures required per commit, in [1, signers_.length]
    constructor(address[] memory signers_, uint256 threshold_) {
        owner = msg.sender;
        uint256 n = signers_.length;
        if (threshold_ == 0 || threshold_ > n) revert InvalidThreshold();
        for (uint256 i; i < n; ++i) {
            address s = signers_[i];
            if (s == address(0)) revert ZeroAddress();
            if (isSigner[s]) revert DuplicateSigner(s);
            isSigner[s] = true;
            emit SignerAdded(s);
        }
        signerCount = n;
        threshold = threshold_;
        emit ThresholdChanged(0, threshold_);
    }

    // ── commit ────────────────────────────────────────────────────────────────────

    /// @inheritdoc IReputationOracle
    function commit(
        uint256 agentId,
        uint16 score,
        bytes32 evidenceHash,
        bytes[] calldata signatures
    ) external {
        if (score > TierMath.SCORE_MAX) revert ScoreOutOfRange();

        Reputation storage r = _rep[agentId];
        uint32 nextEpoch;
        unchecked {
            nextEpoch = r.epoch + 1;
        }
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(
            _digest(agentId, score, evidenceHash, nextEpoch)
        );

        // Require `threshold` signatures from distinct authorized signers. Enforcing strictly
        // ascending recovered addresses gives dedup for free (a duplicate can't be > the last).
        address last = address(0);
        uint256 valid;
        uint256 len = signatures.length;
        for (uint256 i; i < len; ++i) {
            address rec = ECDSA.recover(ethHash, signatures[i]);
            if (rec <= last) revert SignaturesNotSorted();
            if (!isSigner[rec]) revert UnauthorizedSigner(rec);
            last = rec;
            unchecked {
                ++valid;
            }
        }
        if (valid < threshold) revert NotEnoughSignatures(valid, threshold);

        uint8 tier = TierMath.tierOf(score);
        r.score = score;
        r.tier = tier;
        r.updatedAt = uint64(block.timestamp);
        r.epoch = nextEpoch;
        r.evidenceHash = evidenceHash;

        emit ReputationCommitted(agentId, score, tier, nextEpoch, evidenceHash);
    }

    /// @inheritdoc IReputationOracle
    function commitDigest(uint256 agentId, uint16 score, bytes32 evidenceHash)
        external
        view
        returns (bytes32)
    {
        uint32 nextEpoch;
        unchecked {
            nextEpoch = _rep[agentId].epoch + 1;
        }
        return _digest(agentId, score, evidenceHash, nextEpoch);
    }

    function _digest(uint256 agentId, uint16 score, bytes32 evidenceHash, uint32 epoch)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(block.chainid, address(this), agentId, score, evidenceHash, epoch)
        );
    }

    // ── reads ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IReputationOracle
    function getReputation(uint256 agentId) external view returns (Reputation memory) {
        return _rep[agentId];
    }

    /// @inheritdoc IReputationOracle
    function scoreOf(uint256 agentId) external view returns (uint16) {
        return _rep[agentId].score;
    }

    /// @inheritdoc IReputationOracle
    function tierOf(uint256 agentId) external view returns (uint8) {
        return _rep[agentId].tier;
    }

    // ── committee management (owner) ────────────────────────────────────────────────

    function addSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        if (isSigner[signer]) revert DuplicateSigner(signer);
        isSigner[signer] = true;
        unchecked {
            ++signerCount;
        }
        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external onlyOwner {
        if (!isSigner[signer]) revert UnknownSigner(signer);
        // never let the committee shrink below the threshold (would brick commits)
        if (signerCount - 1 < threshold) revert InvalidThreshold();
        isSigner[signer] = false;
        unchecked {
            --signerCount;
        }
        emit SignerRemoved(signer);
    }

    function setThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold == 0 || newThreshold > signerCount) revert InvalidThreshold();
        emit ThresholdChanged(threshold, newThreshold);
        threshold = newThreshold;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }
}
