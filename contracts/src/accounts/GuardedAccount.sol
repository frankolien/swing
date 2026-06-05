// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {SpendingGuardLib} from "../libraries/SpendingGuardLib.sol";
import {SpendDecodeLib} from "../libraries/SpendDecodeLib.sol";

/// @title GuardedAccount
/// @notice A minimal smart-contract wallet that holds drawn capital and runs the
///         SpendingGuardLib ladder in its execute path. Called directly from an EOA/relayer
///         — no bundler, no paymaster — so the rogue-tx revert is guaranteed for the live
///         demo even if Pimlico/Kernel are unavailable on Mantle. The same library backs the
///         ERC-7579 module, so the on-chain behaviour is identical either way.
///
///         Spend metering: native `value`, or the amount field of an ERC-20
///         transfer/transferFrom/approve (the calls that actually move value). The checked
///         destination is the token recipient for those calls, else the call target — so
///         "transfer to a non-allowlisted address" is caught regardless of which contract
///         the transfer flows through.
contract GuardedAccount {
    address public owner; // operator
    address public agent; // scoped session signer, executes within bounds

    SpendingGuardLib.Config public config;
    SpendingGuardLib.Window private window;
    mapping(address dest => bool) public allowedDest;

    error NotOwner();
    error NotAuthorized();
    error CallFailed(bytes ret);

    event AgentSet(address indexed agent);
    event ConfigSet(uint256 perTxCap, uint256 dailyLimit, bool frozen);
    event DestAllowed(address indexed dest, bool allowed);
    event SpendAllowed(address indexed dest, uint256 amount, address target, bytes4 selector);
    event Executed(address indexed target, uint256 value, bytes4 selector);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgentOrOwner() {
        if (msg.sender != agent && msg.sender != owner) revert NotAuthorized();
        _;
    }

    constructor(address owner_, address agent_, SpendingGuardLib.Config memory cfg) {
        owner = owner_;
        agent = agent_;
        config = cfg;
        window.start = uint64(block.timestamp);
        emit AgentSet(agent_);
        emit ConfigSet(cfg.perTxCap, cfg.dailyLimit, cfg.frozen);
    }

    // ── admin (owner only) ───────────────────────────────────────────────────────

    function setAgent(address a) external onlyOwner {
        agent = a;
        emit AgentSet(a);
    }

    function setConfig(SpendingGuardLib.Config calldata c) external onlyOwner {
        config = c;
        emit ConfigSet(c.perTxCap, c.dailyLimit, c.frozen);
    }

    function setFrozen(bool f) external onlyOwner {
        config.frozen = f;
        emit ConfigSet(config.perTxCap, config.dailyLimit, f);
    }

    function setAllowedDest(address dest, bool ok) external onlyOwner {
        allowedDest[dest] = ok;
        emit DestAllowed(dest, ok);
    }

    // ── execution ────────────────────────────────────────────────────────────────

    /// @notice Execute a call from the account. Reverts (with the guard's typed error) if the
    ///         spend breaches policy — this is the rogue-tx beat, visible on the explorer.
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyAgentOrOwner
        returns (bytes memory)
    {
        (address dest, uint256 amount, bytes4 selector) = _decode(target, value, data);
        SpendingGuardLib.enforce(config, window, allowedDest[dest], dest, amount, block.timestamp);
        emit SpendAllowed(dest, amount, target, selector);

        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
        emit Executed(target, value, selector);
        return ret;
    }

    /// @notice Off-chain pre-flight: returns a SpendingGuardLib reason code without writing.
    function previewSpend(address target, uint256 value, bytes calldata data)
        external
        view
        returns (uint8 reason)
    {
        (address dest, uint256 amount,) = _decode(target, value, data);
        return SpendingGuardLib.preview(config, window, allowedDest[dest], amount, block.timestamp);
    }

    function windowState() external view returns (uint64 start, uint256 spent) {
        return (window.start, window.spent);
    }

    // ── internals ──────────────────────────────────────────────────────────────────

    function _decode(address target, uint256 value, bytes calldata data)
        internal
        pure
        returns (address dest, uint256 amount, bytes4 selector)
    {
        return SpendDecodeLib.decodeSpend(target, value, data);
    }

    receive() external payable {}
}
