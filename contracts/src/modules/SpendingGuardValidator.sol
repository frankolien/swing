// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {
    ERC1271_INVALID,
    ERC1271_MAGIC,
    IValidator,
    MODULE_TYPE_VALIDATOR,
    PackedUserOperation,
    SIG_VALIDATION_FAILED,
    SIG_VALIDATION_SUCCESS
} from "./interfaces/IERC7579.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title SpendingGuardValidator
/// @notice ERC-7579 Type-1 validator implementing a scoped agent session key. The autonomous
///         agent gets an ECDSA key authorized to drive the account; UserOps it didn't sign fail
///         validation (pre-inclusion), so a stolen operator key can't even submit. This is the
///         "agent autonomy within bounds" half of the safety story — the SpendingGuardHook is
///         the spend-policy half. Per-account key keyed by msg.sender (the account).
contract SpendingGuardValidator is IValidator {
    mapping(address account => address) public agentKey;

    event AgentKeySet(address indexed account, address indexed agentKey);

    /// @param data abi.encode(address agentKey)
    function onInstall(bytes calldata data) external {
        address key = abi.decode(data, (address));
        agentKey[msg.sender] = key;
        emit AgentKeySet(msg.sender, key);
    }

    function onUninstall(bytes calldata) external {
        delete agentKey[msg.sender];
        emit AgentKeySet(msg.sender, address(0));
    }

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == MODULE_TYPE_VALIDATOR;
    }

    function isInitialized(address smartAccount) external view returns (bool) {
        return agentKey[smartAccount] != address(0);
    }

    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash)
        external
        view
        returns (uint256)
    {
        return _isAgent(msg.sender, userOpHash, userOp.signature)
            ? SIG_VALIDATION_SUCCESS
            : SIG_VALIDATION_FAILED;
    }

    function isValidSignatureWithSender(address, bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        return _isAgent(msg.sender, hash, signature) ? ERC1271_MAGIC : ERC1271_INVALID;
    }

    function _isAgent(address account, bytes32 hash, bytes calldata signature)
        internal
        view
        returns (bool)
    {
        address key = agentKey[account];
        if (key == address(0)) return false;
        (address recovered, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(MessageHashUtils.toEthSignedMessageHash(hash), signature);
        return err == ECDSA.RecoverError.NoError && recovered == key;
    }
}
