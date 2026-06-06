# Demo choreography — the swing

**Thesis (say this first):** *Agents earn trust. Capital follows. Rogue spends revert.*

the swing is a **reputation-gated credit layer for autonomous AI agents on Mantle**. An agent's
track record becomes an on-chain reputation score → that score sets an uncollateralized credit
limit → the drawn capital lives behind an on-chain spending guard. Every step is a verifiable
Mantle event, and the finale is a rogue transaction that **reverts on-chain in front of you**.

> The rubric rewards *better systems, not higher PnL*. This demo shows the system: identity →
> reputation → credit → payments → safety, each anchored to a real transaction.

---

## North-star loop

```
earn  →  reputation  →  credit  →  pay (x402)  →  rogue-reject
 │            │            │            │               │
trades    ERC-8004     ERC-4626     HTTP 402       GuardedAccount
recompute  commit      tier→limit   settle+verify  reverts on-chain
 +commit                            +rep feedback   (status 0)
```

Four buttons, four real transactions, one reverted-by-design. ~90 seconds.

---

## Pre-flight checklist (do this 5 min before)

1. **Servers up**
   ```bash
   ENGINE_PORT=8799 pnpm --filter @swing/engine start   # :8799
   pnpm --filter @swing/web start                         # :3000
   curl -s localhost:8799/health    # ok:true, dataSource, explainer
   ```
2. **Browser**: open `http://localhost:3000` (landing) and a second tab on
   `http://localhost:3000/console?agent=1`. Have `https://explorer.sepolia.mantle.xyz` ready.
3. **Agent #1 state**: Trusted (T3), reputation ~800s/1000, credit line open, account funded.
   The demo is **repeatable** — reverts never move funds; allowed spends + x402 auto-top-up via
   the MockUSDC faucet mint.
4. **Network**: the public Mantle RPC can lag. If a tx is slow, keep narrating — receipts land in
   a few seconds. The reverts are guaranteed regardless of bundler/relayer.

---

## Run-of-show (90 seconds)

| # | Time | On screen | Do | Say | On-chain proof |
|---|------|-----------|----|-----|----------------|
| 0 | 0:00 | Landing | — | "Agents earn trust, capital follows, and rogue spends revert. Here's the whole loop on Mantle." | thesis line, live stats |
| 1 | 0:10 | Console, Agent #1 | point at the gauge + credit panel | "Agent #1 has an ERC-8004 identity and a track record. Our engine scores it 0–1000, recency-decayed and Sybil-gated, and commits that score on-chain." | ReputationOracle commit |
| 2 | 0:22 | Hero panel | click **Run a trading session** | "It trades. The engine recomputes the score from the new track record and commits the update — a real Oracle transaction." | reputation `commit` tx |
| 3 | 0:38 | Credit panel | point at limit/APR | "The score maps to a tier, and the tier sets an **uncollateralized** credit limit — funded by an ERC-4626 lender vault. Better reputation, more credit, lower rate." | CreditManager line / CreditVault |
| 4 | 0:50 | x402 panel | click **Buy over x402** | "Agents don't just borrow — they earn. Another agent buys this one's signal over x402: HTTP 402, settle USDC on Mantle, deliver. The proof-of-payment loops back as ERC-8004 feedback." | settlement tx + rep `commit` tx |
| 5 | 1:05 | Spending controls | click **Pay merchant** | "Now it spends. An allowlisted, in-bounds payment just executes." | `execute` tx, status 1 |
| 6 | 1:14 | Spending controls | click **Drain to attacker** | "But a compromised key tries to drain to an address that isn't allowlisted…" | **`execute` tx, status 0 — reverted** |
| 7 | 1:22 | Mantlescan tab | click the reverted tx link | "…and it **reverts on-chain**. Not a simulation — a mined transaction, status 0, with the guard's typed error. Funds never move. Optionally: oversized payout → reverts on the per-tx cap too." | explorer: status 0, `Destination not allowlisted` |
| 8 | 1:30 | Console | — | "Identity, reputation, credit, payments, safety — every step a verifiable Mantle event. That's the swing." | — |

**If you have 30 extra seconds:** also fire **Oversized payout** (reverts on the per-tx cap, a
*different* guard rung) and mention the same library backs an **ERC-7579** hook + validator for
modular smart accounts (Kernel/Safe), with `GuardedAccount` as the bundler-independent fallback.

---

## The money shot (rehearse this one)

Beat 6→7 is the climax. Click **Drain to attacker** → the card shakes red:
*"Blocked — reverted on-chain · Destination not allowlisted · status 0"* with a fresh tx link.
Click it → Mantlescan shows **status 0 (failed)**. Say: *"A real, mined, reverted transaction —
the guard refused it inside the EVM. This is the difference between telling an agent not to
misbehave and making it impossible."*

---

## On-chain proofs (Mantle Sepolia, chainId 5003)

Explorer: `https://explorer.sepolia.mantle.xyz`

| Contract | Address |
|---|---|
| ReputationOracle | `0xAd480D894c734D71d2A1FD9a7Da802131D3c1617` |
| CreditVault (ERC-4626) | `0x4DC35935403f683Bcab4c34519756C8458654344` |
| CreditManager | `0x742929798a121F043B629e98647060b18db369c3` |
| GuardedAccountFactory | `0x5bd77f46D4c557358409Ca47e8c79A7A3eA4bd44` |
| SpendingGuardHook (7579) | `0xd679EAdad555F0c3b9083e52c2C79f99b713D224` |
| SpendingGuardValidator (7579) | `0xa0DDd52B925c893aD6Af3Ba3cCc560cA362aa19c` |
| MockUSDC | `0xDA9430BE1F57CAcB96951888DD757a1Af7953dBa` |
| Agent #1 GuardedAccount | `0x1A1960bAc3C0852De7De2e5507C7AA1345Bc1C71` |

Sample reverted rogue tx (status 0): `0x88bba1eacc4c6274e054f95cec46a5ffe9bf0eef3b3307a0395472fca91c8bed`

> Generate fresh ones live; every button mints a real transaction.

---

## X / Twitter thread

1/ Autonomous agents can trade, but they can't get **credit** — no track record a lender can
trust, no guardrails a treasury can rely on. We built the missing layer.

Meet **the swing**: a reputation-gated credit layer for AI agents on @0xMantle. 🧵

2/ The loop: an agent's track record → an on-chain **reputation score** (ERC-8004) → an
**uncollateralized credit limit** (ERC-4626 vault) → capital that lives behind an **on-chain
spending guard**. Every step is a verifiable Mantle event.

3/ Reputation is earned, not claimed. Scores are recency-decayed and Sybil-gated, and every
commit is bound to a keccak **evidence hash** — anyone can recompute and audit the decision.

4/ Agents also *earn*: they sell services to each other over **x402**. HTTP 402 → settle USDC on
Mantle → deliver. The proof-of-payment loops back as ERC-8004 feedback, so honest work compounds
into reputation.

5/ The part we care about most: **safety**. Drawn capital sits in a guarded account. A spend to a
non-allowlisted address, or over a cap, doesn't get flagged — it **reverts inside the
transaction**. Watch a rogue drain mine as status 0. 👇 [video]

6/ Built for the Turing Test Hackathon on @0xMantle — ERC-8004 · ERC-4626 · ERC-7579 · x402 ·
Z.ai GLM. Not a trading bot. The trust layer that lets agents hold capital safely.

---

## 60-second video voiceover

> Autonomous agents are starting to manage money — but nobody will extend them credit, because
> there's no track record a lender can trust and no guardrails a treasury can rely on.
>
> the swing fixes both. This is Agent #1. It has an on-chain identity and a trading track record.
> Our engine scores that record zero to a thousand — recency-decayed, Sybil-gated — and commits
> the score to Mantle. [click Run a trading session] It trades, the score recomputes, and the
> update lands on-chain.
>
> That score sets an *uncollateralized* credit limit, funded by a lender vault. Better reputation,
> more credit. Agents also earn: [click Buy over x402] here one agent buys another's signal over
> x402 — real USDC settled on Mantle — and the payment makes the seller's reputation stronger.
>
> And here's the part that matters. The drawn capital lives behind an on-chain guard. A normal
> payment executes. [click Pay merchant] But when a compromised key tries to drain funds to an
> address that isn't allowlisted — [click Drain to attacker] — it **reverts on-chain**. A real
> transaction, status zero, refused inside the EVM. The funds never move.
>
> Identity, reputation, credit, payments, safety — every step a verifiable Mantle event. That's
> the swing.

---

## Judge Q&A cheat-sheet

- **"Is the trading real?"** — The reputation *input* is pluggable behind a `DataSource` interface;
  the demo runs a transparently-labeled simulated/historical track record. The rubric rewards the
  *system*, not live PnL. A Byreal Skills CLI / RealClaw adapter drops in behind the same interface
  with whitelist access — nothing else changes.
- **"Is the revert real or a UI trick?"** — Real. The dashboard submits an actual `execute()` to
  the `GuardedAccount`; we pass explicit gas so the guarded revert *mines* (status 0) instead of
  being caught client-side. Click through to Mantlescan.
- **"Why not just an allowlist off-chain?"** — Off-chain checks are advisory; a compromised key
  bypasses them. Ours is enforced *inside the transaction* by a shared `SpendingGuardLib`, used by
  both the standalone `GuardedAccount` and an ERC-7579 hook — same behavior either way.
- **"How is reputation not gameable?"** — Recency decay, Sybil gating (Passport), and an evidence
  hash binding each commit to its inputs so it's independently recomputable. A single $5 paid job
  barely moves a Trusted score — by design.
- **"What's the x402 facilitator?"** — A mock facilitator: settlement is a real on-chain USDC
  transfer, verified from its Transfer log, replay-protected. The HTTP shape (402 + `accepts`,
  `X-PAYMENT`, `X-PAYMENT-RESPONSE`) is faithful.
- **"GLM?"** — Z.ai GLM narrates each credit decision when `ZAI_API_KEY` is set (`/health` shows
  `explainer: glm`); otherwise a deterministic template. Either way the *numbers* come from the
  engine, never invented by the model.

---

## Reset between runs

Nothing to reset — reverts don't move funds; allowed spends and x402 auto-top-up via the faucet
mint. To start from a pristine score, restart the engine (clears in-memory session state); the
on-chain score is whatever was last committed.
