// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ICreditVault
/// @notice Borrow-authority surface the CreditManager uses. Token custody for draws lives
///         in the vault; the manager is the only caller of these mutating functions.
interface ICreditVault {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function totalBorrowed() external view returns (uint256);
    function availableLiquidity() external view returns (uint256);

    function borrow(address to, uint256 amount) external;
    function onRepay(uint256 principal) external;
    function writeOff(uint256 principal) external;
}
