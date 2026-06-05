// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICreditVault} from "./interfaces/ICreditVault.sol";
import {IReputationOracle} from "./interfaces/IReputationOracle.sol";
import {TierMath} from "./libraries/TierMath.sol";

/// @title CreditManager
/// @notice Opens reputation-tiered credit lines on top of the CreditVault. Reads tier from
///         the ReputationOracle, disburses drawn capital ONLY to a line's registered smart
///         account, accrues two-slope utilization interest, and liquidates on default or a
///         SpendingGuard breach. Default is made expensive in reputational terms (the engine
///         posts an ERC-8004 negative signal off a Liquidated event) — the only enforceable
///         collateral in a pseudonymous setting, which is why eligibility is Sybil-gated.
contract CreditManager is Ownable {
    using SafeERC20 for IERC20;

    struct Line {
        address account; // drawn capital lands here, and only here
        uint8 tier; // snapshot at open/refresh
        uint16 aprBps; // base + slope*utilization + tier spread
        bool liquidated;
        uint64 openedAt;
        uint64 lastAccruedAt;
        uint256 limit; // TierMath.creditLimit(score)
        uint256 principal; // outstanding drawn
        uint256 interestAccrued; // settled interest not yet repaid
        uint256 collateral; // posted collateral, held by this manager
    }

    IReputationOracle public immutable oracle;
    ICreditVault public immutable vault;
    IERC20 public immutable asset;

    mapping(uint256 agentId => Line) public lineOf;

    // two-slope utilization interest model, all in bps
    uint16 internal constant BASE_APR_BPS = 200; // 2%
    uint16 internal constant KINK_BPS = 8000; // 80% utilization
    uint16 internal constant SLOPE1_BPS = 400; // below kink
    uint16 internal constant SLOPE2_BPS = 6000; // above kink (steep)
    uint256 internal constant YEAR = 365 days;

    error NoLine();
    error AlreadyOpen();
    error ZeroAddress();
    error OverLimit(uint256 power, uint256 requested);
    error LineLiquidated();
    error NothingToRepay();
    error InsufficientCollateral();
    error NotAuthorized();

    event LineOpened(uint256 indexed agentId, address indexed account, uint8 tier, uint256 limit);
    event Drawn(uint256 indexed agentId, address indexed to, uint256 amount, uint256 principal);
    event Repaid(
        uint256 indexed agentId, uint256 principal, uint256 interest, uint256 outstanding
    );
    event LimitRefreshed(uint256 indexed agentId, uint8 tier, uint256 limit, uint16 aprBps);
    event CollateralPosted(uint256 indexed agentId, uint256 amount, uint256 total);
    event CollateralWithdrawn(uint256 indexed agentId, uint256 amount, uint256 total);
    event Liquidated(uint256 indexed agentId, uint256 debt, uint256 seized);

    constructor(IReputationOracle oracle_, ICreditVault vault_) Ownable(msg.sender) {
        oracle = oracle_;
        vault = vault_;
        asset = IERC20(vault_.asset());
    }

    // ── lifecycle ───────────────────────────────────────────────────────────────

    function openLine(uint256 agentId, address account) external {
        if (account == address(0)) revert ZeroAddress();
        Line storage line = lineOf[agentId];
        if (line.account != address(0)) revert AlreadyOpen();

        uint16 score = oracle.scoreOf(agentId);
        uint8 tier = oracle.tierOf(agentId);
        line.account = account;
        line.tier = tier;
        line.limit = TierMath.creditLimit(score);
        line.aprBps = _currentApr(tier);
        line.openedAt = uint64(block.timestamp);
        line.lastAccruedAt = uint64(block.timestamp);

        emit LineOpened(agentId, account, tier, line.limit);
    }

    /// @notice Re-read the Oracle and re-tier. This is the "R crosses 750 -> line raised" beat.
    function refreshLimit(uint256 agentId) external {
        Line storage line = _line(agentId);
        _accrue(line);
        uint16 score = oracle.scoreOf(agentId);
        uint8 tier = oracle.tierOf(agentId);
        line.tier = tier;
        line.limit = TierMath.creditLimit(score);
        line.aprBps = _currentApr(tier);
        emit LimitRefreshed(agentId, tier, line.limit, line.aprBps);
    }

    // ── collateral ────────────────────────────────────────────────────────────────

    function postCollateral(uint256 agentId, uint256 amount) external {
        Line storage line = _line(agentId);
        line.collateral += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralPosted(agentId, amount, line.collateral);
    }

    function withdrawCollateral(uint256 agentId, uint256 amount) external {
        Line storage line = _line(agentId);
        if (msg.sender != line.account && msg.sender != owner()) revert NotAuthorized();
        _accrue(line);
        if (amount > line.collateral) revert InsufficientCollateral();
        line.collateral -= amount;
        if (_currentDebt(line) > _borrowingPower(line)) revert InsufficientCollateral();
        asset.safeTransfer(line.account, amount);
        emit CollateralWithdrawn(agentId, amount, line.collateral);
    }

    // ── draw / repay ────────────────────────────────────────────────────────────

    function draw(uint256 agentId, uint256 amount) external {
        Line storage line = _line(agentId);
        if (line.liquidated) revert LineLiquidated();
        _accrue(line);
        uint256 power = _borrowingPower(line);
        uint256 newDebt = _currentDebt(line) + amount;
        if (newDebt > power) revert OverLimit(power, newDebt);
        line.principal += amount;
        vault.borrow(line.account, amount); // disburse ONLY to the registered account
        emit Drawn(agentId, line.account, amount, line.principal);
    }

    /// @notice Repay up to outstanding debt. Caller approves THIS manager for the asset;
    ///         tokens move straight into the vault. Interest is repaid before principal.
    function repay(uint256 agentId, uint256 amount) external {
        Line storage line = _line(agentId);
        _accrue(line);
        uint256 debt = line.principal + line.interestAccrued;
        if (debt == 0) revert NothingToRepay();

        uint256 pay = amount > debt ? debt : amount;
        uint256 interestPaid = pay > line.interestAccrued ? line.interestAccrued : pay;
        uint256 principalPaid = pay - interestPaid;
        line.interestAccrued -= interestPaid;
        line.principal -= principalPaid;

        asset.safeTransferFrom(msg.sender, address(vault), pay);
        vault.onRepay(principalPaid);
        emit Repaid(agentId, principalPaid, interestPaid, line.principal + line.interestAccrued);
    }

    function liquidate(uint256 agentId) external onlyOwner {
        Line storage line = _line(agentId);
        if (line.liquidated) revert LineLiquidated();
        _accrue(line);
        uint256 debt = line.principal + line.interestAccrued;
        uint256 seized = line.collateral;
        uint256 principal = line.principal;

        line.collateral = 0;
        line.principal = 0;
        line.interestAccrued = 0;
        line.liquidated = true;

        if (seized > 0) asset.safeTransfer(address(vault), seized);
        if (principal > 0) vault.writeOff(principal);
        emit Liquidated(agentId, debt, seized);
    }

    // ── views ────────────────────────────────────────────────────────────────────

    function getLine(uint256 agentId) external view returns (Line memory) {
        return lineOf[agentId];
    }

    function borrowingPower(uint256 agentId) external view returns (uint256) {
        return _borrowingPower(lineOf[agentId]);
    }

    function debtOf(uint256 agentId) external view returns (uint256) {
        return _currentDebt(lineOf[agentId]);
    }

    function currentApr(uint256 agentId) external view returns (uint16) {
        return _currentApr(lineOf[agentId].tier);
    }

    // ── internals ──────────────────────────────────────────────────────────────────

    function _line(uint256 agentId) internal view returns (Line storage line) {
        line = lineOf[agentId];
        if (line.account == address(0)) revert NoLine();
    }

    function _accrue(Line storage line) internal {
        line.interestAccrued += _pendingInterest(line);
        line.lastAccruedAt = uint64(block.timestamp);
    }

    function _pendingInterest(Line storage line) internal view returns (uint256) {
        uint256 dt = block.timestamp - line.lastAccruedAt;
        if (dt == 0 || line.principal == 0) return 0;
        return line.principal * line.aprBps * dt / (1e4 * YEAR);
    }

    function _currentDebt(Line storage line) internal view returns (uint256) {
        return line.principal + line.interestAccrued + _pendingInterest(line);
    }

    function _borrowingPower(Line storage line) internal view returns (uint256) {
        if (line.account == address(0) || line.liquidated) return 0;
        uint8 tier = line.tier;
        uint256 fromCollateral = line.collateral * 1e4 / TierMath.collateralFactorBps(tier);
        uint256 power = fromCollateral + _uncollateralizedAllowance(tier, line.limit);
        return power > line.limit ? line.limit : power;
    }

    /// @dev How much a tier may borrow with zero collateral — the point of reputation credit.
    function _uncollateralizedAllowance(uint8 tier, uint256 limit)
        internal
        pure
        returns (uint256)
    {
        if (tier == 3) return limit; // under-collateralized: reputation-only
        if (tier == 2) return limit / 2; // partial
        return 0; // T0/T1 must collateralize
    }

    function _currentApr(uint8 tier) internal view returns (uint16) {
        uint256 util = _utilizationBps();
        uint256 rate = BASE_APR_BPS;
        if (util <= KINK_BPS) {
            rate += util * SLOPE1_BPS / 1e4;
        } else {
            rate += uint256(KINK_BPS) * SLOPE1_BPS / 1e4 + (util - KINK_BPS) * SLOPE2_BPS / 1e4;
        }
        // max rate = base 200 + kink 320 + post-kink 1200 + spread 2000 = 3720 bps < uint16 max
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(rate + _tierSpread(tier));
    }

    function _utilizationBps() internal view returns (uint256) {
        uint256 ta = vault.totalAssets();
        if (ta == 0) return 0;
        return vault.totalBorrowed() * 1e4 / ta;
    }

    /// @dev Lower tiers pay a higher reputation spread.
    function _tierSpread(uint8 tier) internal pure returns (uint16) {
        if (tier == 3) return 200;
        if (tier == 2) return 500;
        if (tier == 1) return 1000;
        return 2000;
    }
}
