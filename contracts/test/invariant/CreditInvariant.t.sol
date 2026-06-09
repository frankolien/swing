// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {CreditManager} from "../../src/CreditManager.sol";
import {CreditVault} from "../../src/CreditVault.sol";
import {ReputationOracle} from "../../src/ReputationOracle.sol";
import {ICreditVault} from "../../src/interfaces/ICreditVault.sol";
import {IReputationOracle} from "../../src/interfaces/IReputationOracle.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    MessageHashUtils
} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

uint256 constant AGENT = 7;

/// @notice Drives a credit line with random draws, repays, collateral moves, and time jumps.
///         The handler is the line's registered account, so it both receives draws and can
///         repay / move collateral. Reverts are swallowed so the fuzzer explores freely.
contract CreditHandler is Test {
    CreditManager public manager;
    MockUSDC public usdc;

    constructor(CreditManager m, MockUSDC u) {
        manager = m;
        usdc = u;
        usdc.approve(address(m), type(uint256).max); // for repay + postCollateral pulls
    }

    function draw(uint256 amount) external {
        try manager.draw(AGENT, bound(amount, 0, 60_000e6)) {} catch {}
    }

    function repay(uint256 amount) external {
        try manager.repay(AGENT, bound(amount, 0, 60_000e6)) {} catch {}
    }

    function postCollateral(uint256 amount) external {
        try
            manager.postCollateral(AGENT, bound(amount, 0, 50_000e6))
        {} catch {}
    }

    function withdrawCollateral(uint256 amount) external {
        try
            manager.withdrawCollateral(AGENT, bound(amount, 0, 50_000e6))
        {} catch {}
    }

    function passTime(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 30 days));
    }
}

/// @notice Solvency / sizing invariants for the credit stack, under random borrower behavior.
contract CreditInvariant is StdInvariant, Test {
    MockUSDC usdc;
    ReputationOracle oracle;
    CreditVault vault;
    CreditManager manager;
    CreditHandler handler;

    address lender = makeAddr("lender");

    function setUp() public {
        (address signer, uint256 signerPk) = makeAddrAndKey("signer");
        usdc = new MockUSDC();
        address[] memory signers = new address[](1);
        signers[0] = signer;
        oracle = new ReputationOracle(signers, 1);
        vault = new CreditVault(
            IERC20(address(usdc)),
            "Swing Credit USDC",
            "scUSDC"
        );
        manager = new CreditManager(
            IReputationOracle(address(oracle)),
            ICreditVault(address(vault))
        );
        vault.setCreditManager(address(manager));

        // lender liquidity
        usdc.mint(lender, 200_000e6);
        vm.startPrank(lender);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(200_000e6, lender);
        vm.stopPrank();

        // commit R=800 (T3) via the 1-of-1 committee
        _commit(signerPk, 800);

        handler = new CreditHandler(manager, usdc);
        manager.openLine(AGENT, address(handler)); // handler is the registered account
        usdc.mint(address(handler), 200_000e6); // headroom to repay interest + post collateral

        targetContract(address(handler));
    }

    function _commit(uint256 signerPk, uint16 score) internal {
        bytes32 evi = bytes32(0);
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(
            oracle.commitDigest(AGENT, score, evi)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethHash);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s, v);
        oracle.commit(AGENT, score, evi, sigs);
    }

    /// Outstanding principal can never exceed the line's credit limit.
    function invariant_principalNeverExceedsLimit() public view {
        CreditManager.Line memory l = manager.getLine(AGENT);
        assertLe(l.principal, l.limit);
    }

    /// Borrowing power is always capped at the limit (reputation sets a hard ceiling).
    function invariant_borrowingPowerNeverExceedsLimit() public view {
        CreditManager.Line memory l = manager.getLine(AGENT);
        assertLe(manager.borrowingPower(AGENT), l.limit);
    }

    /// Vault accounting identity holds through every draw/repay/writeoff.
    function invariant_vaultAccountingIdentity() public view {
        assertEq(
            vault.totalAssets(),
            vault.availableLiquidity() + vault.totalBorrowed()
        );
    }
}
