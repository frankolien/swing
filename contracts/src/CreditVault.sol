// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CreditVault
/// @notice Lender-facing ERC-4626 capital pool. Lenders deposit the vault asset and earn
///         yield from borrower interest. The vault is NOT an undercollateralized lender
///         itself: its sole borrow authority is the CreditManager, which enforces the
///         reputation-tiered credit logic on top (the 4626 standard is for atomic
///         deposit/redeem, not async undercollateralized draws — keep them separate).
///         Inflation/donation attack is mitigated by a non-zero decimals offset (virtual
///         shares) plus a dead-shares seed at deploy.
contract CreditVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    uint8 private constant DECIMALS_OFFSET = 6;

    address public creditManager;
    uint256 public totalBorrowed;

    error NotCreditManager();
    error CreditManagerAlreadySet();
    error InsufficientLiquidity();
    error ZeroAddress();

    event CreditManagerSet(address indexed creditManager);
    event Borrowed(address indexed to, uint256 amount);
    event RepaidToVault(uint256 principal);
    event WrittenOff(uint256 principal);

    modifier onlyCreditManager() {
        if (msg.sender != creditManager) revert NotCreditManager();
        _;
    }

    constructor(IERC20 asset_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(asset_)
        Ownable(msg.sender)
    {}

    function setCreditManager(address manager) external onlyOwner {
        if (manager == address(0)) revert ZeroAddress();
        if (creditManager != address(0)) revert CreditManagerAlreadySet();
        creditManager = manager;
        emit CreditManagerSet(manager);
    }

    /// @dev Idle balance plus outstanding principal. Interest repaid above principal raises
    ///      idle balance and therefore the share price — that is the lender yield.
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + totalBorrowed;
    }

    function availableLiquidity() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function borrow(address to, uint256 amount) external onlyCreditManager {
        if (amount > availableLiquidity()) revert InsufficientLiquidity();
        totalBorrowed += amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Borrowed(to, amount);
    }

    /// @dev Repayment tokens (principal + interest) are transferred straight into the vault
    ///      by the manager's `repay`; this only settles accounting. Interest stays as idle
    ///      balance and accrues to lenders.
    function onRepay(uint256 principal) external onlyCreditManager {
        totalBorrowed -= principal;
        emit RepaidToVault(principal);
    }

    /// @dev On liquidation, unrecoverable principal is written off; seized collateral is
    ///      transferred in separately by the manager and offsets the loss to lenders.
    function writeOff(uint256 principal) external onlyCreditManager {
        totalBorrowed -= principal;
        emit WrittenOff(principal);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return DECIMALS_OFFSET;
    }
}
