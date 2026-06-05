# Status — 2026-06-05 (Day 1)

## Done (verified)

**On-chain layer — complete, 60 Foundry tests passing.**
- `TierMath` — tier curve, super-linear credit limit `(R/1000)^1.5` clamped per tier.
- `ReputationOracle` — R + tier per ERC-8004 agentId, signer-gated, evidence-hash bound.
- `CreditVault` — ERC-4626 lender pool, inflation attack mitigated (virtual offset + dead shares).
- `CreditManager` — tier→limit, open/draw/repay/liquidate, two-slope interest, uncollateralized
  allowance for high tiers. Disburses only to a line's registered account.
- `SpendingGuardLib` — six-check ladder (frozen → destination → per-tx → daily window).
- `GuardedAccount` (+ CREATE2 factory) — AA-independent wallet running the ladder; the rogue-tx
  revert beat, tested on all four rungs.
- `SpendingGuardHook` (Type 4) + `SpendingGuardValidator` (Type 1) — ERC-7579 modules: the hook
  reverts policy-breaching spends during execution (modular-account rogue-tx beat), the validator
  is a scoped agent session key. Self-contained interfaces; tested via a mock ERC-7579 account.
- `Deploy.s.sol` — deploys all 7 contracts + seeds the vault; simulates clean, writes deployments JSON.

**packages/shared — typechecks clean.** Tier-math mirror, Mantle + ERC-8004 config, reason-code
enum, contract types, 6 generated ABIs (`pnpm --filter @swing/shared gen-abis`).

**apps/engine scoring core — 7 vitest tests passing.** Recency-decayed (30d half-life),
Sybil-gated scoring with deterministic keccak evidence hash. Strong agent → T3; low-passport /
thin-history → capped at T0; old losses decay away.

## Verify it
```bash
pnpm contracts:test                 # 51 pass (incl. rogue-tx revert)
pnpm --filter @swing/engine test    # 7 pass
pnpm --filter @swing/shared typecheck && pnpm --filter @swing/engine typecheck
```

## Next (in order of leverage)
1. **Real deploy to Mantle Sepolia** — fund a throwaway key, `forge script Deploy --broadcast --verify`,
   pin addresses in `.env` + a `deployments/5003.json`. Confirms cancun/MCOPY on Mantle.
2. **Engine wiring** — viem client; `commit()` to the Oracle; event indexer (vault/credit/Spend);
   HTTP API for the dashboard. Then the Byreal/RealClaw PnL adapter (simulated default).
3. **Next.js dashboard** — identity card, reputation gauge, credit tier, positions, live
   SpendBlocked panel (editorial light theme — Best UI/UX play).
4. **x402 + GLM** — paid agent-to-agent endpoint with proof-of-payment → ERC-8004 feedback;
   GLM natural-language explanations of every credit decision.
5. **(optional) Live AA wiring** — install the ERC-7579 modules on a real Kernel v3 / Safe7579
   account via Pimlico. Modules + tests already done; this is just the bundler/paymaster path.
   `GuardedAccount` stays the guaranteed demo fallback.
6. **Demo + submission** — 90s video, X thread, README polish.

## Open risks / re-confirm
- Mantle Sepolia accepts MCOPY (cancun) — confirm on first real deploy.
- Real Mantle vault-asset token address (USDC/USDY) before swapping out MockUSDC.
- ERC-8004 singleton addresses — verify on-chain before trusting.
