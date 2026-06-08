// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC7579Account, IHook, IValidator} from "../../src/modules/interfaces/IERC7579.sol";

/// @notice Minimal ERC-7579-style account for module tests: installs a validator + hook and
///         wraps single-call execution with the hook's preCheck/postCheck, exactly as Kernel v3
///         / Safe7579 do. Just enough to exercise the SpendingGuard modules end-to-end without
///         pulling a full account-abstraction stack.
contract MockAccount is IERC7579Account {
    address public hook;
    address public validator;

    function installHook(address h, bytes calldata data) external {
        hook = h;
        IHook(h).onInstall(data);
    }

    function installValidator(address v, bytes calldata data) external {
        validator = v;
        IValidator(v).onInstall(data);
    }

    function execute(bytes32 mode, bytes calldata executionCalldata) external payable {
        mode; // single-call only in this harness
        bytes memory hookData;
        if (hook != address(0)) hookData = IHook(hook).preCheck(msg.sender, msg.value, msg.data);

        (address target, uint256 value, bytes calldata cd) = _decodeSingle(executionCalldata);
        (bool ok, bytes memory ret) = target.call{value: value}(cd);
        require(ok, _revertMsg(ret));

        if (hook != address(0)) IHook(hook).postCheck(hookData);
    }

    function _decodeSingle(bytes calldata ec)
        internal
        pure
        returns (address target, uint256 value, bytes calldata cd)
    {
        target = address(bytes20(ec[0:20]));
        value = uint256(bytes32(ec[20:52]));
        cd = ec[52:];
    }

    function _revertMsg(bytes memory ret) internal pure returns (string memory) {
        return ret.length == 0 ? "exec failed" : string(ret);
    }

    receive() external payable {}
}
