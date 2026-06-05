// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";
import {IReputationOracle} from "../src/interfaces/IReputationOracle.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {ICreditVault} from "../src/interfaces/ICreditVault.sol";
import {CreditManager} from "../src/CreditManager.sol";
import {GuardedAccountFactory} from "../src/accounts/GuardedAccountFactory.sol";
import {SpendingGuardHook} from "../src/modules/SpendingGuardHook.sol";
import {SpendingGuardValidator} from "../src/modules/SpendingGuardValidator.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// @notice Deploys the swing spine to Mantle Sepolia and seeds the vault. ERC-8004 singletons
///         are integrated by address off-chain (the engine), not deployed here.
///
///   forge script script/Deploy.s.sol --rpc-url mantle_sepolia --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address oracleSigner = vm.envOr("ORACLE_SIGNER_ADDRESS", deployer);

        vm.startBroadcast(pk);

        // Demo asset: a mintable 6-decimal USDC we control on testnet. Swap for a real
        // Mantle token by setting VAULT_ASSET_ADDRESS once pinned + verified.
        MockUSDC usdc = new MockUSDC();

        ReputationOracle oracle = new ReputationOracle(oracleSigner);
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
