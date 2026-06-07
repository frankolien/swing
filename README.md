# the swing

**A reputation-gated credit layer for autonomous AI agents — on Mantle.**

An agent earns a **portable, verifiable reputation** from its real on-chain track
record (DEX trading PnL + ERC-8004 reputation signals). That reputation **gates
access to capital** — larger, partially- or under-collateralized credit lines drawn
from an on-chain credit vault. The capital is deployed through a **spending-controlled
smart account** whose guard **rejects rogue transactions on-chain** — per-tx caps,
rolling daily limits, allowlists. Agents pay each other for services over **x402**.

> The signature beat: a compromised key tries to drain the account, and the
> transaction **reverts on-chain** — a real, mined, `status 0` failure on the Mantle
> explorer ([see it](https://sepolia.mantlescan.xyz/tx/0x0ec58c2f015116ad89fcb558aa8e429ceefac2c20edd7ce2c28bdab26734ced2)).
> Earn → reputation → credit → deploy → *safety*, every step a verifiable Mantle event.

This is infrastructure, not a single bot. It binds the three things autonomous
agents are missing — portable creditworthiness, safe custody of capital, and a
standard pay rail — into one composable economic layer.

**Status: live on Mantle Sepolia.** All 7 contracts deployed + **source-verified on
Mantlescan**, 60 passing Foundry tests, and the full north-star loop executed on-chain
with real transactions (reputation commit → credit draw → allowed spend → **rogue
revert**). Addresses and tx hashes below.

---

## The loop

```mermaid
graph LR
  Trade["🤖 trade via<br/>Byreal / RealClaw"] -->|PnL, positions| Engine["Reputation Engine<br/>recency-decayed · Sybil-gated"]

  subgraph onchain["⛓️ on Mantle — every box is a verifiable event"]
    direction TB
    Oracle["ReputationOracle<br/>R · tier"]
    Manager["CreditManager<br/>tier → limit"]
    Vault["CreditVault<br/>ERC-4626 pool"]
    Account["Smart Account<br/>+ SpendingGuard"]
    Allowed["✅ allowed tx executes"]
    Rogue["❌ rogue tx REVERTS"]
    Oracle -->|tier| Manager
    Manager -->|draw| Vault
    Vault -->|disburse| Account
    Account --> Allowed
    Account --> Rogue
  end

  Engine -->|commits R| Oracle
  Account -->|"x402 (USDC / MNT)"| Pay["agent-to-agent<br/>payment"]
  Pay -->|proof-of-payment| Feedback["ERC-8004<br/>feedback"]
  Feedback -.->|enriches| Engine

  classDef ok fill:#16a34a,stroke:#15803d,color:#ffffff;
  classDef bad fill:#dc2626,stroke:#b91c1c,color:#ffffff;
  class Allowed ok;
  class Rogue bad;
```

## Live & verified

**Deployed + source-verified on Mantle Sepolia (chainId 5003).** Deployer / oracle
signer: `0x4D6A7d6bF3C0a885D581AacEC0345526bd33273E`.

| Contract | Address (verified source) |
|---|---|
| MockUSDC (vault asset / faucet) | [`0xDA94…3dBa`](https://sepolia.mantlescan.xyz/address/0xDA9430BE1F57CAcB96951888DD757a1Af7953dBa#code) |
| ReputationOracle | [`0xAd48…1617`](https://sepolia.mantlescan.xyz/address/0xAd480D894c734D71d2A1FD9a7Da802131D3c1617#code) |
| CreditVault (ERC-4626) | [`0x4DC3…4344`](https://sepolia.mantlescan.xyz/address/0x4DC35935403f683Bcab4c34519756C8458654344#code) |
| CreditManager | [`0x7429…69c3`](https://sepolia.mantlescan.xyz/address/0x742929798a121F043B629e98647060b18db369c3#code) |
| GuardedAccountFactory | [`0x5bd7…bd44`](https://sepolia.mantlescan.xyz/address/0x5bd77f46D4c557358409Ca47e8c79A7A3eA4bd44#code) |
| SpendingGuardHook (ERC-7579 Type 4) | [`0xd679…D224`](https://sepolia.mantlescan.xyz/address/0xd679EAdad555F0c3b9083e52c2C79f99b713D224#code) |
| SpendingGuardValidator (ERC-7579 Type 1) | [`0xa0DD…aa19c`](https://sepolia.mantlescan.xyz/address/0xa0DDd52B925c893aD6Af3Ba3cCc560cA362aa19c#code) |

Canonical record: [`contracts/deployments/5003.json`](contracts/deployments/5003.json).

### The full loop, executed on-chain (agentId 1)

| Step | Result | Tx |
|---|---|---|
| 1. Reputation commit | `R = 800` → tier **T3 (Trusted)** | [`0xf100c046…`](https://sepolia.mantlescan.xyz/tx/0xf100c0467edcbbf3647cbe1dcccc64d745e6c96e374c7a4c561026004849a4ef) |
| 2. Credit line | borrowing power **35,777 USDC** = `creditLimit(800)` | (read) |
| 3. Draw | **5,000 USDC** disbursed to the guarded account | [`0x82f672ff…`](https://sepolia.mantlescan.xyz/tx/0x82f672fff56d3e5a861b50f1eb3c51c1ed59fc1bb5b9fdd94b0085b5a26aef12) |
| 4. Allowed spend | **1,000 USDC** → allowlisted merchant ✅ | [`0x589a730a…`](https://sepolia.mantlescan.xyz/tx/0x589a730ad98734d85de0b701177e2086afcb8887c71d416e5933c7cdc2d6cae8) |
| 5. **Rogue spend** | → non-allowlisted attacker → **REVERTED** (`status 0`, attacker balance `0`) | [`0x0ec58c2f…`](https://sepolia.mantlescan.xyz/tx/0x0ec58c2f015116ad89fcb558aa8e429ceefac2c20edd7ce2c28bdab26734ced2) |

Step 5 is the prize beat: a real, mined, **failed** transaction — the `SpendingGuard`
rejecting a drain attempt inside the EVM. The difference between *telling* an agent not
to misbehave and *making it impossible*.

### What's wired, end-to-end

- **Reputation engine** — scores realized PnL (30-day half-life decay, Sybil-gated) and
  **auto-commits** `R ∈ [0,1000]` to the Oracle with an `evidenceHash` binding the commit
  to its exact inputs (recomputable / auditable). 7 passing scoring tests.
- **Real on-chain PnL** — indexes a live Mantle trader's DEX swaps (Merchant Moe / Agni)
  via the Etherscan V2 account API, reconstructs realized PnL in USD from stablecoin legs,
  and scores it. Not simulation — every trade is a public Mantle tx. (`/agents` → *Live
  Mantle trader* panel.)
- **x402 payments** — faithful HTTP-402 round-trip (`402 + accepts` → `X-PAYMENT` → `200 +
  X-PAYMENT-RESPONSE`) with **real on-chain USDC settlement**, Transfer-log verification,
  and replay protection. Proof-of-payment loops back as an ERC-8004 reputation commit.
- **Z.ai GLM** — live natural-language explanations of each credit decision (`glm-4.5-flash`),
  with a deterministic template fallback on missing key / provider error.
- **Wallet-connected product flows** — connect an injected wallet (auto-switch / add Mantle
  Sepolia), **lend** on `/vault` (faucet → approve → deposit → withdraw, ERC-4626), or
  **launch your own agent** on `/launch` (engine attests reputation → your wallet signs
  create → openLine → draw). User-signed, not a server puppet.
- **Safety** — the `SpendingGuard` six-check ladder lives in one Solidity library used by
  **both** the ERC-7579 module **and** a direct `GuardedAccount`, so the rogue-tx revert
  never depends on bundler / AA infra.

## Pieces

| Layer | What it is | Where |
|---|---|---|
| **Identity** | ERC-8004 agentId per agent; `agentWallet` → the smart account | `ReputationOracle` |
| **Reputation** | off-chain engine scores PnL + ERC-8004 signals → `R ∈ [0,1000]`, committed on-chain | `apps/engine`, `ReputationOracle` |
| **Credit** | ERC-4626 lender pool + a `CreditManager` opening reputation-tiered credit lines | `contracts` |
| **Safety** | `SpendingGuardLib` ladder → ERC-7579 Validator + Hook, and a direct `GuardedAccount` | `contracts/src` |
| **Payments** | x402 agent-to-agent settlement, proof-of-payment looped back as ERC-8004 feedback | `apps/engine` |
| **Reasoning** | Z.ai GLM narrates each credit decision (live) | `apps/engine` |
| **Dashboard** | landing · console · agents registry + live on-chain trader · vault (lend) · launch | `apps/web` |

## Repo layout

```
contracts/        Foundry — the spine (Solidity). On-chain is the source of truth.
  src/
    ReputationOracle.sol      R + tier per agentId, written by the engine signer
    CreditVault.sol           OZ ERC-4626 lender pool + inflation-attack mitigation
    CreditManager.sol         tier→limit math, open/draw/repay/liquidate
    libraries/
      TierMath.sol            pure: tier(R), limit(R), collateral factor
      SpendingGuardLib.sol    the six-check ladder, shared by module + fallback wallet
    modules/
      SpendingGuardValidator.sol   ERC-7579 Type 1 — reverts rogue txs in validation
      SpendingGuardHook.sol        ERC-7579 Type 4 — accounting + SpendBlocked/Allowed
    accounts/
      GuardedAccount.sol      minimal direct wallet (AA-independent demo fallback)
packages/shared/  TS: addresses, ABIs, tier-math mirror, shared types
apps/engine/      Node/TS reputation engine + indexer + x402 + GLM + on-chain PnL (Hono, viem)
apps/web/         Next.js dashboard — wallet connect, lender + operator-launch flows
docs/             PLAN.md · ARCHITECTURE.md · DEMO.md (run-of-show) · DEPLOYMENT.md · decisions/
```

## Quickstart

```bash
pnpm install
git submodule update --init --recursive   # forge libs (OZ, Solady, forge-std)
cp .env.example .env                       # RPC + a funded testnet signer; ZAI/Mantlescan keys optional

# contracts — 60 tests incl. the rogue-tx revert
pnpm contracts:test

# run the stack (contracts are already deployed; addresses in contracts/deployments/5003.json)
ENGINE_PORT=8799 pnpm --filter @swing/engine start   # reputation engine + API on :8799
pnpm --filter @swing/web dev                          # dashboard on http://localhost:3000
```

The dashboard reads the engine on `:8799`. To exercise the wallet flows, point an injected
wallet (MetaMask / Rabby) at Mantle Sepolia — the app will prompt to switch / add it — and
grab gas from the [Mantle Sepolia faucet](https://faucet.sepolia.mantle.xyz); the in-app
faucet mints test USDC.

## Demo

The 90-second run-of-show, X thread, and judge Q&A are in [`docs/DEMO.md`](docs/DEMO.md).
The climax is beat 6→7: **Drain to attacker** → the card shakes red → click the tx →
Mantlescan shows **status 0 (failed)**.

## Built for

Turing Test Hackathon 2026 — Mantle × Bybit × Byreal × BGA — **Agentic Economy** track.
Core functionality runs end-to-end on Mantle; every reputation commit, credit decision, and
rejection is an on-chain event. Reasoning + natural-language explanations by **Z.ai GLM**.

Lineage: [`agent_fuel`](https://github.com/frankolien/agent_fuel) — the Solana ancestor of
this design.
