// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title IReputationOracle
/// @notice On-chain, composable commitment of an agent's reputation, keyed by ERC-8004
///         agentId. Written by the off-chain Reputation Engine signer; read by anyone
///         (the CreditManager gates credit on it).
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
    event SignerRotated(address indexed previous, address indexed current);

    function commit(uint256 agentId, uint16 score, bytes32 evidenceHash) external;
    function getReputation(uint256 agentId) external view returns (Reputation memory);
    function scoreOf(uint256 agentId) external view returns (uint16);
    function tierOf(uint256 agentId) external view returns (uint8);
    function signer() external view returns (address);
}
