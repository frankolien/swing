# ADR-0001 — Stack & scope

Status: accepted · 2026-06-05

## Context
9-day hackathon build of "the swing" on Mantle. Spec in `the_swing_prd.pdf`. We have a
proven Solana ancestor (`agent_fuel`) whose design we are porting to EVM and extending
with ERC-8004 identity, ERC-7579 spending modules, and x402.

## Decisions

1. **Monorepo, pnpm workspaces.** Not Turborepo — keep tooling light for a hackathon.
   `contracts/` (Foundry, its own toolchain) + `packages/*` + `apps/*`.

2. **Contracts first; on-chain is the source of truth.** Engine/dashboard are projections.
   We design top-down from the contract spec (`ARCHITECTURE.md`) before writing Solidity.

3. **SpendingGuard logic lives in a shared library**, consumed by both the ERC-7579
   module and a minimal direct `GuardedAccount`. Rationale: the rogue-tx revert is the
   prize-winning beat; it must not depend on third-party AA infra (Pimlico/Kernel) being
   reliable on Mantle. The direct wallet is the always-works fallback (PRD Day-8 threshold).

4. **ERC-4626 vault + separate CreditManager** for under-collateralized draws. 4626 is
   built for atomic deposit/redeem, not async undercollateralized lending (that is
   ERC-7540's domain). We keep the vault a clean, audited 4626 and put credit logic on
   top. ERC-7540 is a labeled stretch only. Inflation/donation attack mitigated via OZ
   virtual offset + dead-shares seed.

5. **Reputation keyed by ERC-8004 `agentId`**, not raw address — portable, transfer-aware.
   On-chain `ReputationOracle` is the swing-native fast read; we *also* post ERC-8004
   `tradingYield` feedback to the canonical registry for cross-protocol composability.

6. **Z.ai GLM for reasoning + NL explanations** (sponsor + judge; technically sound),
   behind a model-abstraction layer with a Claude Sonnet fallback for live-demo reliability.

7. **Data source is pluggable**, default **simulated**. Byreal CLI JSON / RealClaw live
   data swapped in behind the same interface if whitelist access lands. Transparency over
   live mainnet PnL — the rubric rewards verifiable systems, not the highest return.

8. **Libraries:** OpenZeppelin (ERC4626, ownership, ERC721 reads), Solady
   (FixedPointMathLib for the `(R/1000)^γ` curve, gas-lean primitives), Rhinestone
   ModuleKit (write/test 7579 modules across accounts). Solidity ^0.8.23.

9. **Target network:** Mantle Sepolia (chainId 5003) for build + demo. ERC-8004 singletons
   integrated by address (verify on-chain before trusting). Mainnet addresses recorded but
   not the build target.

## Consequences
- The demo is de-risked: two independent paths to the on-chain revert.
- The vault stays composable and audit-aligned; credit complexity is isolated.
- Engine and dashboard can be developed against deployed contracts + simulated data in
  parallel once the spine is on testnet (Day 2).

## Out of scope (this build)
ERC-7540 async vault, zkML/TEE validators, heavy subgraph indexing, cross-chain bridging.
