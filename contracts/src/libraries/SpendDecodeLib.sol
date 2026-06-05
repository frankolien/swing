// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title SpendDecodeLib
/// @notice Resolves the effective destination and spend amount of an outgoing call, so the
///         guard catches "transfer to a non-allowlisted address" regardless of which contract
///         the value flows through. Shared by GuardedAccount and the ERC-7579 SpendingGuardHook
///         so both meter spends identically. Tuned for native value + the ERC-20 calls that move
///         value (transfer / transferFrom / approve); other calls meter native `value` to `target`.
library SpendDecodeLib {
    function decodeSpend(address target, uint256 value, bytes calldata data)
        internal
        pure
        returns (address dest, uint256 amount, bytes4 selector)
    {
        dest = target;
        amount = value;
        if (data.length >= 4) {
            selector = bytes4(data[:4]);
            if (selector == IERC20.transfer.selector && data.length >= 68) {
                (address to, uint256 a) = abi.decode(data[4:], (address, uint256));
                (dest, amount) = (to, a);
            } else if (selector == IERC20.approve.selector && data.length >= 68) {
                (address sp, uint256 a) = abi.decode(data[4:], (address, uint256));
                (dest, amount) = (sp, a);
            } else if (selector == IERC20.transferFrom.selector && data.length >= 100) {
                (, address to, uint256 a) = abi.decode(data[4:], (address, address, uint256));
                (dest, amount) = (to, a);
            }
        }
    }
}
