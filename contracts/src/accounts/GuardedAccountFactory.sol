// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {SpendingGuardLib} from "../libraries/SpendingGuardLib.sol";
import {GuardedAccount} from "./GuardedAccount.sol";

/// @title GuardedAccountFactory
/// @notice Deterministic (CREATE2) deployment of GuardedAccounts, one per agent identity, so
///         the engine and dashboard can derive an account address before it exists.
contract GuardedAccountFactory {
    event AccountCreated(
        uint256 indexed agentId, address indexed account, address owner, address agent
    );

    function createAccount(
        uint256 agentId,
        address owner,
        address agent,
        SpendingGuardLib.Config calldata cfg
    ) external returns (address account) {
        bytes32 salt = keccak256(abi.encode(agentId, owner));
        account = address(new GuardedAccount{salt: salt}(owner, agent, cfg));
        emit AccountCreated(agentId, account, owner, agent);
    }

    function predict(
        uint256 agentId,
        address owner,
        address agent,
        SpendingGuardLib.Config calldata cfg
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(agentId, owner));
        bytes32 initHash = keccak256(
            abi.encodePacked(type(GuardedAccount).creationCode, abi.encode(owner, agent, cfg))
        );
        bytes32 h = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash));
        return address(uint160(uint256(h)));
    }
}
