// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {CreditManager} from "../src/CreditManager.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";
import {GuardedAccountFactory} from "../src/accounts/GuardedAccountFactory.sol";
import {ICreditVault} from "../src/interfaces/ICreditVault.sol";
import {IReputationOracle} from "../src/interfaces/IReputationOracle.sol";
import {SpendingGuardHook} from "../src/modules/SpendingGuardHook.sol";
import {SpendingGuardValidator} from "../src/modules/SpendingGuardValidator.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys the swing spine to Mantle Sepolia and seeds the vault. ERC-8004 singletons
///         are integrated by address off-chain (the engine), not deployed here.
///
///   forge script script/Deploy.s.sol --rpc-url mantle_sepolia --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address oracleSigner = vm.envOr("ORACLE_SIGNER_ADDRESS", deployer);

        // Reputation signer committee. Defaults to a 1-of-1 (the engine signer) so the dev flow
        // is unchanged; set ORACLE_SIGNER_2 / ORACLE_SIGNER_3 + ORACLE_THRESHOLD (e.g. 2) for a
        // 2-of-3 quorum so no single key can fabricate a score.
        address[] memory signers = _committee(
            oracleSigner,
            vm.envOr("ORACLE_SIGNER_2", address(0)),
            vm.envOr("ORACLE_SIGNER_3", address(0))
        );
        uint256 threshold = vm.envOr("ORACLE_THRESHOLD", uint256(1));

        vm.startBroadcast(pk);

        // Demo asset: a mintable 6-decimal USDC we control on testnet. Swap for a real
        // Mantle token by setting VAULT_ASSET_ADDRESS once pinned + verified.
        MockUSDC usdc = new MockUSDC();

        ReputationOracle oracle = new ReputationOracle(signers, threshold);
        CreditVault vault = new CreditVault(IERC20(address(usdc)), "Swing Credit USDC", "scUSDC");
        CreditManager manager =
            new CreditManager(IReputationOracle(address(oracle)), ICreditVault(address(vault)));
        vault.setCreditManager(address(manager));
        GuardedAccountFactory factory = new GuardedAccountFactory();

        // ERC-7579 SpendingGuard modules (install on Kernel/Safe accounts; singletons, stateless
        // until an account calls onInstall). The GuardedAccount remains the AA-independent path.
        SpendingGuardHook hook = new SpendingGuardHook();
        SpendingGuardValidator validator = new SpendingGuardValidator();

        // Seed dead shares (defense-in-depth atop the virtual-offset) and demo liquidity.
        usdc.mint(deployer, 1_100_000e6);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1e6, address(0xdead));
        vault.deposit(100_000e6, deployer);

        vm.stopBroadcast();

        console2.log("chainId           ", block.chainid);
        console2.log("MockUSDC          ", address(usdc));
        console2.log("ReputationOracle  ", address(oracle));
        console2.log("CreditVault       ", address(vault));
        console2.log("CreditManager     ", address(manager));
        console2.log("AccountFactory    ", address(factory));
        console2.log("SpendingGuardHook ", address(hook));
        console2.log("SpendingGuardVal  ", address(validator));
        console2.log("oracleSigner      ", oracleSigner);
        console2.log("oracle committee  ", oracle.signerCount());
        console2.log("oracle threshold  ", oracle.threshold());

        D memory d = D({
            usdc: address(usdc),
            oracle: address(oracle),
            vault: address(vault),
            manager: address(manager),
            factory: address(factory),
            hook: address(hook),
            validator: address(validator)
        });
        _writeDeployments(d);
    }

    /// @dev Assemble the committee from up to three addresses, dropping zeros. The first is
    ///      always present (the engine signer); extras enable a k-of-n quorum.
    function _committee(address a, address b, address c) internal pure returns (address[] memory) {
        uint256 n = 1;
        if (b != address(0)) ++n;
        if (c != address(0)) ++n;
        address[] memory out = new address[](n);
        out[0] = a;
        uint256 i = 1;
        if (b != address(0)) out[i++] = b;
        if (c != address(0)) out[i] = c;
        return out;
    }

    struct D {
        address usdc;
        address oracle;
        address vault;
        address manager;
        address factory;
        address hook;
        address validator;
    }

    function _writeDeployments(D memory d) internal {
        string memory o = "deployments";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "MockUSDC", d.usdc);
        vm.serializeAddress(o, "ReputationOracle", d.oracle);
        vm.serializeAddress(o, "CreditVault", d.vault);
        vm.serializeAddress(o, "CreditManager", d.manager);
        vm.serializeAddress(o, "GuardedAccountFactory", d.factory);
        vm.serializeAddress(o, "SpendingGuardHook", d.hook);
        string memory json = vm.serializeAddress(o, "SpendingGuardValidator", d.validator);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
