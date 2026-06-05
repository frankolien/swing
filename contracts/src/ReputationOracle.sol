// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IReputationOracle} from "./interfaces/IReputationOracle.sol";
import {TierMath} from "./libraries/TierMath.sol";

/// @title ReputationOracle
/// @notice The swing-native fast read of an agent's score. The engine computes the
///         heavy, recency-decayed, Sybil-gated R off-chain and commits the result here;
///         `evidenceHash` binds the commit to its inputs so anyone can recompute and audit.
///         The same engine also posts ERC-8004 `tradingYield` feedback to the canonical
///         registry for cross-protocol composability.
contract ReputationOracle is IReputationOracle {
    mapping(uint256 agentId => Reputation) private _rep;

    address public signer;
    address public owner;

    error NotSigner();
    error NotOwner();
    error ScoreOutOfRange();
    error ZeroAddress();

    modifier onlySigner() {
        if (msg.sender != signer) revert NotSigner();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address signer_) {
        if (signer_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        signer = signer_;
        emit SignerRotated(address(0), signer_);
    }

    /// @inheritdoc IReputationOracle
    function commit(uint256 agentId, uint16 score, bytes32 evidenceHash) external onlySigner {
        if (score > TierMath.SCORE_MAX) revert ScoreOutOfRange();
        uint8 tier = TierMath.tierOf(score);

        Reputation storage r = _rep[agentId];
        r.score = score;
        r.tier = tier;
        r.updatedAt = uint64(block.timestamp);
        unchecked {
            r.epoch += 1;
        }
        r.evidenceHash = evidenceHash;

        emit ReputationCommitted(agentId, score, tier, r.epoch, evidenceHash);
    }

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

    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit SignerRotated(signer, newSigner);
        signer = newSigner;
    }
}
