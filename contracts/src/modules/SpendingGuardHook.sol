// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {
    IHook,
    IERC7579Account,
    MODULE_TYPE_HOOK
} from "./interfaces/IERC7579.sol";
import {SpendingGuardLib} from "../libraries/SpendingGuardLib.sol";
import {SpendDecodeLib} from "../libraries/SpendDecodeLib.sol";

/// @title SpendingGuardHook
/// @notice ERC-7579 Type-4 hook enforcing the six-check ladder during execution. On a breach it
///         reverts in `preCheck`, so the UserOp fails on-chain (explorer-visible) — the rogue-tx
///         beat for the modular-account path. Same SpendingGuardLib as GuardedAccount, so the
///         behaviour is identical whether capital sits in the fallback wallet or a Kernel/Safe.
///         Per-account state is keyed by msg.sender (the account calls the hook).
contract SpendingGuardHook is IHook {
    struct GuardStore {
        SpendingGuardLib.Config config;
        SpendingGuardLib.Window window;
        mapping(address dest => bool) allowedDest;
        bool initialized;
    }

    mapping(address account => GuardStore) private _store;

    event Installed(address indexed account, uint256 perTxCap, uint256 dailyLimit);
    event Uninstalled(address indexed account);
    event SpendAllowed(address indexed account, address indexed dest, uint256 amount);
    event DestAllowed(address indexed account, address indexed dest, bool allowed);
    event FrozenSet(address indexed account, bool frozen);

    // ── ERC-7579 lifecycle ─────────────────────────────────────────────────────────

    /// @param data abi.encode(uint256 perTxCap, uint256 dailyLimit, address[] allowedDests)
    function onInstall(bytes calldata data) external {
        (uint256 perTxCap, uint256 dailyLimit, address[] memory dests) =
            abi.decode(data, (uint256, uint256, address[]));
        GuardStore storage gs = _store[msg.sender];
        gs.config = SpendingGuardLib.Config({perTxCap: perTxCap, dailyLimit: dailyLimit, frozen: false});
        gs.window.start = uint64(block.timestamp);
        for (uint256 i; i < dests.length; ++i) {
            gs.allowedDest[dests[i]] = true;
        }
        gs.initialized = true;
        emit Installed(msg.sender, perTxCap, dailyLimit);
    }

    function onUninstall(bytes calldata) external {
        GuardStore storage gs = _store[msg.sender];
        delete gs.config;
        delete gs.window;
        gs.initialized = false;
        emit Uninstalled(msg.sender);
    }

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == MODULE_TYPE_HOOK;
    }

    function isInitialized(address smartAccount) external view returns (bool) {
        return _store[smartAccount].initialized;
    }

    // ── hook ──────────────────────────────────────────────────────────────────────

    function preCheck(address, uint256, bytes calldata msgData)
        external
        returns (bytes memory)
    {
        GuardStore storage gs = _store[msg.sender];
        (bool ok, address target, uint256 value, bytes calldata inner) = _parseSingleExecute(msgData);
        if (ok) {
            (address dest, uint256 amount,) = SpendDecodeLib.decodeSpend(target, value, inner);
            SpendingGuardLib.enforce(
                gs.config, gs.window, gs.allowedDest[dest], dest, amount, block.timestamp
            );
            emit SpendAllowed(msg.sender, dest, amount);
        }
        return "";
    }

    function postCheck(bytes calldata) external {}

    // ── account-managed config (msg.sender == account) ──────────────────────────────

    function setAllowedDest(address dest, bool allowed) external {
        _store[msg.sender].allowedDest[dest] = allowed;
        emit DestAllowed(msg.sender, dest, allowed);
    }

    function setFrozen(bool frozen) external {
        _store[msg.sender].config.frozen = frozen;
        emit FrozenSet(msg.sender, frozen);
    }

    // ── views ────────────────────────────────────────────────────────────────────

    function configOf(address account)
        external
        view
        returns (uint256 perTxCap, uint256 dailyLimit, bool frozen)
    {
        SpendingGuardLib.Config storage c = _store[account].config;
        return (c.perTxCap, c.dailyLimit, c.frozen);
    }

    function windowOf(address account) external view returns (uint64 start, uint256 spent) {
        SpendingGuardLib.Window storage w = _store[account].window;
        return (w.start, w.spent);
    }

    function isAllowedDest(address account, address dest) external view returns (bool) {
        return _store[account].allowedDest[dest];
    }

    // ── internals ──────────────────────────────────────────────────────────────────

    /// @dev Parse a single-call `execute(bytes32 mode, bytes executionCalldata)` from the
    ///      account's msgData. Single-call executionCalldata is packed: target(20) value(32)
    ///      callData(rest). Returns ok=false for non-execute selectors or batch/non-single modes,
    ///      so the hook never blocks config/install calls — only metered spends.
    function _parseSingleExecute(bytes calldata msgData)
        internal
        pure
        returns (bool ok, address target, uint256 value, bytes calldata inner)
    {
        inner = msgData[0:0];
        if (msgData.length < 68 || bytes4(msgData[:4]) != IERC7579Account.execute.selector) {
            return (false, address(0), 0, inner);
        }
        // mode is msgData[4:36]; CallType is its first byte (0x00 == single)
        if (msgData[4] != 0x00) return (false, address(0), 0, inner);

        uint256 off = uint256(bytes32(msgData[36:68])); // offset to executionCalldata in args
        uint256 lenPos = 4 + off;
        if (msgData.length < lenPos + 32) return (false, address(0), 0, inner);
        uint256 len = uint256(bytes32(msgData[lenPos:lenPos + 32]));
        uint256 ecStart = lenPos + 32;
        if (msgData.length < ecStart + len || len < 52) return (false, address(0), 0, inner);

        bytes calldata ec = msgData[ecStart:ecStart + len];
        target = address(bytes20(ec[0:20]));
        value = uint256(bytes32(ec[20:52]));
        inner = ec[52:];
        ok = true;
    }
}
