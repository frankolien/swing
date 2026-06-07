// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title IReputationOracle
/// @notice On-chain, composable commitment of an agent's reputation, keyed by ERC-8004
///         agentId. Reads are open to anyone (the CreditManager gates credit on them); writes
///         require a THRESHOLD of signatures from an owner-managed signer committee, so no
///         single key can fabricate a score. Each commit is bound to its inputs (evidenceHash)
///         and to the agent's next epoch (replay protection).
interface IReputationOracle {
    struct Reputation {
        uint16 score; // R in [0,1000]
        uint8 tier; // 0..3, derived from score at commit time
        uint64 updatedAt; // block.timestamp of last commit
        uint32 epoch; // monotonic; increments per recompute
        bytes32 evidenceHash; // hash of the off-chain scoring inputs (auditable)
    }

    event ReputationCommitted(
        uint256 indexed agentId, uint16 score, uint8 tier, uint32 epoch, bytes32 evidenceHash
    );
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event ThresholdChanged(uint256 previous, uint256 current);

    /// @notice Commit a score for `agentId`. `signatures` must contain at least `threshold`
    ///         signatures from distinct committee signers over `commitDigest(...)`, ordered by
    ///         ascending signer address. Permissionless to submit — the authority is the quorum.
    function commit(
        uint256 agentId,
        uint16 score,
        bytes32 evidenceHash,
        bytes[] calldata signatures
    ) external;

    /// @notice The exact digest the committee must sign for the NEXT commit to `agentId`.
    ///         Bound to chainId + this contract + the agent's next epoch, so signatures cannot
    ///         be replayed across chains, deployments, or epochs.
    function commitDigest(uint256 agentId, uint16 score, bytes32 evidenceHash)
        external
        view
        returns (bytes32);

    function getReputation(uint256 agentId) external view returns (Reputation memory);
    function scoreOf(uint256 agentId) external view returns (uint16);
    function tierOf(uint256 agentId) external view returns (uint8);

    function threshold() external view returns (uint256);
    function signerCount() external view returns (uint256);
    function isSigner(address account) external view returns (bool);
}
