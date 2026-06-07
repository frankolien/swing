# Status — 2026-06-06 (Day 2)

## Done (verified)

**Live on Mantle Sepolia + full product loop — verified on-chain.**
- **Deployed** all 7 contracts to Mantle Sepolia (chainId 5003); addresses pinned in
  `contracts/deployments/5003.json`. cancun/MCOPY confirmed accepted.
- **Engine** (`apps/engine`) — viem client (`batch:false` for the public RPC), auto-commit of
  recomputed scores to the Oracle, event indexer, Hono HTTP API, registry/leaderboard scan.
- **Dashboard** (`apps/web`) — multi-page Next.js, monochrome Entrypoint aesthetic: landing,
  console, agents leaderboard, vault. Reputation gauge, credit panel, trading record.
- **Live rogue-reject** — the dashboard submits a real `execute()` to the `GuardedAccount`; an
  allowlisted spend executes (status 1), a rogue/oversized spend **mines as a reverted tx
  (status 0)** with the guard's typed error. Explicit-gas trick so the revert mines instead of
  being caught client-side. The signature beat, generated live.
- **x402** — faithful HTTP-402 flow (`402` + `accepts` → `X-PAYMENT` → `200` + `X-PAYMENT-RESPONSE`)
  with a mock facilitator: real on-chain USDC settlement, Transfer-log verification, replay
  protection. Proof-of-payment loops back as an ERC-8004 reputation commit. Dashboard panel shows
  the round-trip with live tx links.
- **Z.ai GLM — live.** `explain()` narrates each credit decision with GLM (`glm-4.5-flash` free
  tier, thinking disabled for ~3s replies); `/health` → `explainer: glm`. Deterministic template
  stays as a silent fallback on missing key / provider error.
- **All 8 contracts verified on Mantlescan** (Etherscan V2 multichain, `chainid=5003`): the 7 spine
  contracts + agent #1's `GuardedAccount`. Source viewable at `sepolia.mantlescan.xyz`.
- **Byreal Skills CLI — live read-only integration.** Engine shells out to the official
  `@byreal-io/byreal-cli` for real market data (`overview`), cached 60s, graceful fallback;
  `/byreal/market` + a dashboard strip. Honestly framed: Byreal's CLMM is on Solana, so this is
  live *signal context* the agent reads — reputation/credit/safety stay on Mantle.
- **Verified on-chain Mantle trade record — real PnL feed.** Engine reads a live trader's DEX swaps
  on Mantle **mainnet** (Merchant Moe / Agni, via the Etherscan V2 account API), reconstructs
  realized PnL in USD from stablecoin legs (avg-cost, no price oracle), and scores it. Full loop is
  real + verifiable: live swaps → realized PnL → reputation → on-chain commit (`/onchain/commit`,
  status 1 on Sepolia) → GLM explanation. Dashboard panel shows every trade as a clickable mainnet
  tx. This is the honest "real on-chain PnL" the simulated source stands in for.

**Product layer — wallet-connected, user-signed flows (not just the server-signed demo).**
- **Wallet connect** (wagmi v2 + viem, injected connector, Mantle Sepolia) with a network-switch
  guard, in the header on every page.
- **Lender flow** (`/vault`) — connect → faucet-mint test USDC → approve → deposit → hold scUSDC →
  withdraw. Fully **user-signed** standard ERC-4626.
- **Operator onboarding** (`/launch`) — a 4-step stepper: engine attests a starter reputation
  (`POST /onboard`, oracle-signed — you can't self-assign it), then **your wallet signs** the
  GuardedAccount create → `openLine` → `draw`. Reputation→credit→spend, owned by the user. The full
  on-chain flow is verified (predict→create→openLine→draw→funds land; borrowing power $5k at T2).
- The guided server-signed demo (rogue-reject, x402, etc.) stays — it works without the viewer
  owning the account; the wallet flows are additive.

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
pnpm contracts:test                 # 60 pass (incl. rogue-tx revert)
pnpm --filter @swing/engine test    # 7 pass
pnpm --filter @swing/shared typecheck && pnpm --filter @swing/engine typecheck
```

## Demo
Full run-of-show, X thread, video voiceover, and judge Q&A in [`docs/DEMO.md`](./DEMO.md).

## Next (in order of leverage)
1. **Point the on-chain indexer at a RealClaw agent.** Done generically for any Mantle address; a
   RealClaw competition agent address would make the narrative pointed. RealClaw itself exposes no
   PnL API and the comp has ended — the on-chain indexer is the honest path (reads any agent's real
   Mantle DEX trades directly). Perps PnL (vs spot) would need protocol-specific position decoding.
2. **(optional) Live AA wiring** — install the ERC-7579 modules on a real Kernel v3 / Safe7579
   account via Pimlico. Modules + tests already done; just the bundler/paymaster path.
   `GuardedAccount` stays the guaranteed demo fallback.
3. **Submission** — record the 90s video, post the X thread, final README pass.

## Open risks / re-confirm
- Real Mantle vault-asset token address (USDC/USDY) before swapping out MockUSDC.
- ERC-8004 singleton addresses — verify on-chain before trusting.
- Byreal CLI chain surface (Solana vs Mantle) — confirm before wiring the live adapter.
