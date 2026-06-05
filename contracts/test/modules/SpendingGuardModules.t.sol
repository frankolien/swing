// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {SpendingGuardHook} from "../../src/modules/SpendingGuardHook.sol";
import {SpendingGuardValidator} from "../../src/modules/SpendingGuardValidator.sol";
import {SpendingGuardLib} from "../../src/libraries/SpendingGuardLib.sol";
import {PackedUserOperation} from "../../src/modules/interfaces/IERC7579.sol";
import {MockAccount} from "./MockAccount.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @notice The ERC-7579 path of the rogue-tx beat: the hook reverts a policy-breaching spend
///         during execution, and the validator gates UserOps to the agent session key.
contract SpendingGuardModulesTest is Test {
    MockUSDC usdc;
    MockAccount account;
    SpendingGuardHook hook;
    SpendingGuardValidator validator;

    address merchant = makeAddr("merchant");
    address attacker = makeAddr("attacker");
    uint256 constant AGENT_PK = 0xA11CE;
    address agent;

    uint256 constant PER_TX = 2_000e6;
    uint256 constant DAILY = 5_000e6;

    function setUp() public {
        usdc = new MockUSDC();
        account = new MockAccount();
        hook = new SpendingGuardHook();
        validator = new SpendingGuardValidator();
        agent = vm.addr(AGENT_PK);

        address[] memory dests = new address[](1);
        dests[0] = merchant;
        account.installHook(address(hook), abi.encode(PER_TX, DAILY, dests));
        account.installValidator(address(validator), abi.encode(agent));
        usdc.mint(address(account), 1_000_000e6);
    }

    function _exec(address target, uint256 value, bytes memory cd) internal {
        account.execute(bytes32(0), abi.encodePacked(target, uint256(value), cd));
    }

    function _transfer(address to, uint256 amt) internal pure returns (bytes memory) {
        return abi.encodeCall(IERC20.transfer, (to, amt));
    }

    // ── hook: the on-chain revert beat through a modular account ────────────────────

    function test_hook_allowsWhitelistedSpend() public {
        _exec(address(usdc), 0, _transfer(merchant, 1_000e6));
        assertEq(usdc.balanceOf(merchant), 1_000e6);
        (, uint256 spent) = hook.windowOf(address(account));
        assertEq(spent, 1_000e6);
    }

    function test_hook_revertsRogueDestination() public {
        vm.expectRevert(
            abi.encodeWithSelector(SpendingGuardLib.DestinationNotAllowed.selector, attacker)
        );
        _exec(address(usdc), 0, _transfer(attacker, 1_000e6));
        assertEq(usdc.balanceOf(attacker), 0);
    }

    function test_hook_revertsPerTxCap() public {
        vm.expectRevert(
            abi.encodeWithSelector(SpendingGuardLib.PerTxCapExceeded.selector, PER_TX, 3_000e6)
        );
        _exec(address(usdc), 0, _transfer(merchant, 3_000e6));
    }

    function test_hook_revertsDailyLimit() public {
        _exec(address(usdc), 0, _transfer(merchant, 2_000e6));
        _exec(address(usdc), 0, _transfer(merchant, 2_000e6));
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingGuardLib.DailyLimitExceeded.selector, DAILY, 4_000e6, 2_000e6
            )
        );
        _exec(address(usdc), 0, _transfer(merchant, 2_000e6));
    }

    function test_hook_frozen() public {
        vm.prank(address(account));
        hook.setFrozen(true);
        vm.expectRevert(SpendingGuardLib.Frozen.selector);
        _exec(address(usdc), 0, _transfer(merchant, 1e6));
    }

    // ── validator: scoped agent session key ─────────────────────────────────────────

    function test_validator_acceptsAgentSignature() public {
        bytes32 h = keccak256("userOpHash");
        bytes memory sig = _sign(AGENT_PK, h);
        PackedUserOperation memory op;
        op.signature = sig;
        vm.prank(address(account));
        assertEq(validator.validateUserOp(op, h), 0); // SIG_VALIDATION_SUCCESS
    }

    function test_validator_rejectsWrongSignature() public {
        bytes32 h = keccak256("userOpHash");
        bytes memory sig = _sign(0xBEEF, h);
        PackedUserOperation memory op;
        op.signature = sig;
        vm.prank(address(account));
        assertEq(validator.validateUserOp(op, h), 1); // SIG_VALIDATION_FAILED
    }

    function test_validator_erc1271() public {
        bytes32 h = keccak256("digest");
        vm.prank(address(account));
        assertEq(validator.isValidSignatureWithSender(address(0), h, _sign(AGENT_PK, h)), bytes4(0x1626ba7e));
        vm.prank(address(account));
        assertEq(validator.isValidSignatureWithSender(address(0), h, _sign(0xBEEF, h)), bytes4(0xffffffff));
    }

    // ── module metadata ─────────────────────────────────────────────────────────────

    function test_moduleTypes() public view {
        assertTrue(hook.isModuleType(4));
        assertFalse(hook.isModuleType(1));
        assertTrue(validator.isModuleType(1));
        assertFalse(validator.isModuleType(4));
    }

    function _sign(uint256 pk, bytes32 hash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, MessageHashUtils.toEthSignedMessageHash(hash));
        return abi.encodePacked(r, s, v);
    }
}
