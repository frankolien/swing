// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Minimal, self-contained ERC-7579 + ERC-4337 v0.7 surface the SpendingGuard modules
///         implement. Kept local (rather than pulling ModuleKit's node_modules dependency tree)
///         so the build stays clean; the signatures match the standards so the modules install
///         on Kernel v3 / Safe7579 unchanged.

/// @dev ERC-4337 v0.7 packed user operation.
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

// ERC-7579 module type ids
uint256 constant MODULE_TYPE_VALIDATOR = 1;
uint256 constant MODULE_TYPE_EXECUTOR = 2;
uint256 constant MODULE_TYPE_FALLBACK = 3;
uint256 constant MODULE_TYPE_HOOK = 4;

// ERC-4337 validation return codes
uint256 constant SIG_VALIDATION_SUCCESS = 0;
uint256 constant SIG_VALIDATION_FAILED = 1;

// ERC-1271 magic values
bytes4 constant ERC1271_MAGIC = 0x1626ba7e;
bytes4 constant ERC1271_INVALID = 0xffffffff;

interface IERC7579Module {
    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;
    function isModuleType(uint256 moduleTypeId) external view returns (bool);
    function isInitialized(address smartAccount) external view returns (bool);
}

interface IValidator is IERC7579Module {
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash)
        external
        returns (uint256);
    function isValidSignatureWithSender(address sender, bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4);
}

interface IHook is IERC7579Module {
    function preCheck(address msgSender, uint256 msgValue, bytes calldata msgData)
        external
        returns (bytes memory hookData);
    function postCheck(bytes calldata hookData) external;
}

interface IERC7579Account {
    /// @param mode CallType in byte 0 (0x00 single, 0x01 batch), ExecType in byte 1.
    function execute(bytes32 mode, bytes calldata executionCalldata) external payable;
}
