# the swing — 9-day build plan

Due **2026-06-14** (Phase II ends 2026-06-15). Today is **2026-06-05**.

North star: **earn → reputation → credit → deploy → rogue-reject**, every step a
verifiable Mantle event. The on-chain revert is the prize-winning beat and must
work regardless of third-party AA tooling.

Scope discipline (from the rubric): we are **not** rewarding the highest PnL — we
reward *better systems*. Keep trading deterministic; spend the cleverness on the
reputation→credit→safety loop and its verifiability.

---

## Critical path

The contracts are the spine. Everything downstream (engine, dashboard) reads them.
The rogue-reject demo depends on the SpendingGuard. So contracts go first, and the
guard logic ships behind a **shared library** usable by both the ERC-7579 module
*and* a minimal direct wallet — so the revert beat survives even if Pimlico/Kernel
misbehave on Mantle.

## Days

### Day 1 (today) — Foundations & spine
- [x] Monorepo scaffold (pnpm), git, docs, env template.
- [ ] Foundry project: OZ + ModuleKit + Solady, remappings, CI-fast config.
- [ ] `TierMath` (pure tier/limit/CF) + `ReputationOracle` (R + tier per agentId).
- **Checkpoint:** `forge test` green on TierMath + Oracle.

### Day 2 — Vault + Credit Manager
- `CreditVault` (OZ ERC-4626 + inflation-attack mitigation via virtual offset / dead shares).
- `CreditManager`: tier→limit math, `openLine` / `draw` / `repay` / `liquidate`, reads Oracle.
- Tests: full happy + every error branch; the 4626 donation attack is neutralised.
- Deploy spine to Mantle Sepolia (5003); pin addresses in `.env` + `packages/shared`.
- **Checkpoint:** crossing R=750 raises the on-chain credit line (test + testnet tx).

### Day 3 — SpendingGuard library + fallback wallet (the safety net)
- `SpendingGuardLib`: six-check ladder — `frozen → allowlist → per-tx cap → rolling
  daily window → ceiling` — operating on `(GuardConfig, GuardState)`.
- `GuardedAccount`: minimal direct smart wallet using the lib; `execute()` reverts a
  rogue tx with a typed error. **This alone guarantees the demo.**
- Tests: zero amounts, max uint, window boundary, empty allowlist, each check in order.
- **Checkpoint (north star, AA-independent):** allowlisted in-bounds tx succeeds; an
  out-of-bounds rogue tx reverts — verified on the Sepolia explorer.

### Day 4 — ERC-7579 modules + AA wiring
- `SpendingGuardValidator` (Type 1): decode userOp calldata, run the lib, revert in
  `validateUserOp` so the EntryPoint rejects on-chain.
- `SpendingGuardHook` (Type 4): post-exec accounting; emit `SpendAllowed/SpendBlocked`.
- ModuleKit tests across Kernel/Safe7579. Wire Pimlico bundler+paymaster (EntryPoint v0.7).
- Session key (scoped validator): allowed targets = CreditManager/Byreal router/MerchantMoe.
- **Checkpoint:** same rogue tx now reverts at the *validator* through a real bundler.
- **Threshold:** if AA infra is shaky → demo runs on `GuardedAccount` (Day 3). No risk.

### Day 5 — Reputation Engine + indexer + on-chain commit
- Node/TS service: scoring formula (recency decay half-life 30d), Sybil gate (Passport).
- Indexer (Viem watch, or Ponder if time): ERC-8004 feedback, vault/credit, Spend events.
- Engine signer commits `R` to `ReputationOracle` + posts ERC-8004 `tradingYield` feedback.
- **Checkpoint:** a new trade → recompute → `R` updates on-chain and is readable.

### Day 6 — Data adapters + x402 + autonomy loop
- Byreal CLI / RealClaw PnL adapter behind an interface; **simulated dataset** as the
  safe default (transparently labeled), live source if whitelist access lands.
- Chain ≥2 Byreal Skills (LP + perp/position) into the agent loop (integration depth).
- x402 paid endpoint (Mantle DevKit, mock facilitator); `proofOfPayment` → ERC-8004 feedback.
- GLM orchestration + NL explanations of every credit decision ("limit $5k→$12k because…").
- **Checkpoint:** autonomous plan → trade → repay loop runs with GLM explanations.

### Day 7 — Dashboard
- Next.js + Tailwind + shadcn/ui: identity card, live reputation gauge, credit tier/limit,
  deployed positions, real-time **spending-controls panel** that visibly rejects the rogue tx.
- Privy embedded wallet (mirrors RealClaw's stack). Editorial light theme (Best UI/UX play).
- **Checkpoint:** dashboard reflects on-chain state live; SpendBlocked flashes on reject.

### Day 8 — Polish, gasless, dry-run, verify
- Gasless via paymaster; error states; loading; mobile-decent.
- Full end-to-end dry-run of the 90-second demo choreography, twice.
- Verify all contracts on mantlescan; explorer links everywhere.
- **Checkpoint:** the whole loop runs unattended in <2 min with real txs.

### Day 9 — Submission & narrative
- Tight demo video landing earn→reputation→credit→deploy→rogue-reject.
- X thread (`#MantleAIHackathon` + pitch + video + GitHub + Mantle contract address);
  lead with the rogue-reject and the earn→credit loop in the first two paragraphs.
- README polish, architecture diagram, BGA "blockchain for good" framing.
- Buffer.

---

## Thresholds that change the plan
- **AA infra flaky by end of Day 4** → ship the demo on `GuardedAccount` (direct wallet,
  same lib). The revert beat is never at risk.
- **RealClaw whitelist unavailable** → drive reputation from Byreal CLI JSON +
  simulated/historical trades, stated transparently. The rubric values verifiability,
  not live mainnet PnL.
- **GLM API hiccup in the demo** → model-abstraction layer falls back to Claude Sonnet.
- **Validation Registry churn** → keep the credit-auditor validator a clearly-labeled
  stretch goal; do not block the core loop on it.

## What we deliberately skip
- ERC-7540 async vault (stretch only; `CreditManager`-on-top of 4626 is the 9-day resolution).
- zkML / TEE validators (flagged "under active update" by the 8004 team).
- Heavy subgraph indexing (Viem/Ponder is enough for a demo).
- Cross-chain Byreal-Solana bridging — we read PnL JSON, we don't bridge.
