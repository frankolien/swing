# the swing — architecture & component contracts

> Design top-down from the chain. On-chain is the source of truth; every layer below
> (engine, indexer, API, dashboard) is a projection of on-chain state. This document
> is the spec the Solidity mechanically translates — if structure is being invented in
> the contract, the spec was skipped.

Conventions: amounts are in the vault asset's smallest unit (assume 6-decimal USDC on
Sepolia). `R ∈ [0, 1000]`, fixed-point integer. Tiers `T0..T3`. Time is `block.timestamp`.

---

## 1. ReputationOracle

The on-chain, composable commitment of an agent's score. Off-chain aggregation is
heavy and lives in the engine (the EIP explicitly anticipates "an ecosystem of
specialized scoring services" — that is what we are); the Oracle is the verifiable
result anyone can read and gate on.

**Identity key.** Agents are keyed by their **ERC-8004 `agentId`** (the Identity NFT
tokenId), so reputation is bound to a portable, transfer-aware identity rather than a
raw address.

```solidity
struct Reputation {
    uint16  score;        // R ∈ [0,1000]
    uint8   tier;         // 0..3, derived from score at commit time
    uint64  updatedAt;    // block.timestamp of last commit
    uint32  epoch;        // monotonic; engine increments per recompute
    bytes32 evidenceHash; // hash of the off-chain scoring evidence (PnL window, inputs)
}

mapping(uint256 agentId => Reputation) public reputationOf;
address public signer;     // the Reputation Engine's authorized writer
address public owner;      // can rotate signer

function commit(
    uint256 agentId,
    uint16  score,
    bytes32 evidenceHash
) external onlySigner;                 // tier := TierMath.tierOf(score); epoch++

function getReputation(uint256 agentId)
    external view returns (Reputation memory);

function setSigner(address newSigner) external onlyOwner;
```

Events: `ReputationCommitted(agentId, score, tier, epoch, evidenceHash)`,
`SignerRotated(old, new)`.
Errors: `NotSigner()`, `ScoreOutOfRange()`.

Notes:
- `evidenceHash` makes a commit auditable: the engine publishes the inputs off-chain
  (feedbackURI), anyone can recompute and check the hash. This is our verifiability story.
- The engine *also* posts an ERC-8004 `tradingYield` feedback signal to the canonical
  ReputationRegistry — the Oracle is the swing-native fast read; the registry is the
  standard, cross-protocol signal.

---

## 2. TierMath (pure library)

Single source of truth for the tier curve. Mirrored in `packages/shared` for the UI/engine.

```solidity
enum Tier { T0_Unproven, T1_Emerging, T2_Established, T3_Trusted }

// thresholds (inclusive lower bound): T0 [0,250) T1 [250,500) T2 [500,750) T3 [750,1000]
function tierOf(uint16 score) internal pure returns (uint8);

// credit limit grows super-linearly within a capped band:
//   limit = baseLimit · (R/1000)^γ, γ≈1.5, clamped to tierCap(tier)
function creditLimit(uint16 score) internal pure returns (uint256);

// collateral factor in bps: T0 15000 (150%), T1 10000, T2 5000, T3 2000
function collateralFactorBps(uint8 tier) internal pure returns (uint16);

// per-tx cap and daily limit per tier (the SpendingGuard defaults)
function perTxCap(uint8 tier)    internal pure returns (uint256);
function dailyLimit(uint8 tier)  internal pure returns (uint256);
```

Tier table (illustrative, denominated in USDC units; configurable at deploy):

| Tier | R range | CF | Max credit | Per-tx cap | Daily limit |
|---|---|---|---|---|---|
| T0 Unproven | 0–249 | 150% | $100 | $25 | $50 |
| T1 Emerging | 250–499 | 100% | $1,000 | $250 | $500 |
| T2 Established | 500–749 | 50% | $10,000 | $2,000 | $5,000 |
| T3 Trusted | 750–1000 | 20% | $50,000 | $10,000 | $25,000 |

`(R/1000)^γ` is computed with a fixed-point pow (Solady `FixedPointMathLib`) to keep
the curve smooth inside a tier rather than a step function.

---

## 3. CreditVault (ERC-4626)

Lender-facing capital pool. Lenders `deposit` the vault asset and receive shares;
yield accrues from borrower interest. **Not** an undercollateralized lender itself —
draws happen through the CreditManager, which is the vault's sole borrow authority.

- OZ `ERC4626` base.
- **Inflation-attack mitigation:** OZ virtual-offset (decimals offset) *and* a dead-shares
  seed on deploy. Donation/first-depositor attack is neutralised.
- Borrow plumbing: the vault tracks `totalBorrowed`; only `creditManager` may
  `borrow(to, amount)` / `repay(from, amount)`. `totalAssets = idle + totalBorrowed`.
- Two-slope utilization interest accrual (Aave/Compound style) is computed by the
  CreditManager and pushed as `repay(principal + interest)`; the vault stays a clean
  4626 and simply sees assets return.

```solidity
function setCreditManager(address) external onlyOwner;   // one-time
function borrow(address to, uint256 amount) external onlyCreditManager;
function repay(address from, uint256 amount) external onlyCreditManager;
function totalBorrowed() external view returns (uint256);
```

Errors: `NotCreditManager()`, `InsufficientLiquidity()`.

---

## 4. CreditManager

Reads tier from the Oracle, opens reputation-tiered credit lines, disburses from the
vault to the agent's smart account, accrues interest, and liquidates on default or on a
SpendingGuard breach.

```solidity
struct Line {
    uint256 agentId;
    address account;        // the agent's smart account (drawn capital lands here)
    uint8   tier;           // snapshot at open; refreshed on draw
    uint256 limit;          // TierMath.creditLimit(score)
    uint256 principal;      // outstanding drawn
    uint256 collateral;     // posted collateral (asset units)
    uint64  openedAt;
    uint64  lastAccruedAt;
    uint16  aprBps;         // base + slope·utilization + tier riskSpread
    bool    liquidated;
}

mapping(uint256 agentId => Line) public lineOf;

function openLine(uint256 agentId, address account) external;     // reads Oracle tier
function postCollateral(uint256 agentId, uint256 amount) external;
function draw(uint256 agentId, uint256 amount) external;           // checks borrowing power
function repay(uint256 agentId, uint256 amount) external;          // principal + accrued interest
function refreshLimit(uint256 agentId) external;                   // re-read Oracle, re-tier
function liquidate(uint256 agentId) external;                      // default / guard breach
function borrowingPower(uint256 agentId) external view returns (uint256);
```

Borrowing power = `collateral · 1e4 / CF(tier) + uncollateralizedAllowance(tier)`,
clamped to `limit`. APR via utilization curve + tier spread; lower tiers pay more.

Liquidation triggers (a) seizure of posted collateral, (b) an ERC-8004 **negative**
feedback signal (reputation slash, emitted for the engine to relay), and (c) tier
demotion request. Reputational cost is the real collateral in a pseudonymous setting —
which is why eligibility is Sybil-gated upstream in the engine.

Events: `LineOpened`, `Drawn`, `Repaid`, `LimitRefreshed`, `Liquidated`,
`CollateralPosted`.
Errors: `NoLine()`, `OverLimit()`, `InsufficientCollateral()`, `LineLiquidated()`,
`NothingToRepay()`.

---

## 5. SpendingGuardLib (the six-check ladder)

Ported from `agent_fuel`'s `policy.rs`. Pure check logic over explicit state, reused by
**both** the ERC-7579 module and the direct `GuardedAccount` — so the revert beat does
not depend on AA tooling.

```solidity
struct GuardConfig {
    uint256 perTxCap;        // 0 = unlimited
    uint256 dailyLimit;      // 0 = unlimited
    bool    frozen;          // kill switch
    // allowlist stored as mapping in the host (target+selector); lib takes a bool
}

struct GuardState {
    uint256 windowStart;     // start of the rolling 24h window
    uint256 windowSpent;     // spent in current window
}

// ladder order is load-bearing — it determines which typed error fires:
//   1 frozen  2 allowlist  3 per-tx cap  4 rolling daily window  5 ceiling
function check(
    GuardConfig storage cfg,
    GuardState   storage st,
    bool   targetAllowed,
    uint256 amount,
    uint256 nowTs
) internal;   // reverts with the first failing check; updates window on success
```

Errors (typed, for the dashboard post-mortem): `Frozen()`, `TargetNotAllowed(address)`,
`PerTxCapExceeded(uint256 cap, uint256 amount)`,
`DailyLimitExceeded(uint256 limit, uint256 windowSpent, uint256 amount)`.

The rolling window resets when `nowTs - windowStart >= 1 days`; otherwise the new spend
accumulates and must stay `<= dailyLimit`. Zero-cap means "no limit," matching agent_fuel.

---

## 6. ERC-7579 modules

`SpendingGuardValidator` (Type 1) and `SpendingGuardHook` (Type 4), built with Rhinestone
ModuleKit so they install on Kernel v3 / Safe7579 alike.

- **Validator** `validateUserOp`: decode the call(s) from `userOp.callData`, resolve the
  target+selector against the allowlist, run `SpendingGuardLib.check`. A failed check
  reverts during validation → the EntryPoint/bundler rejects the UserOp **on-chain**.
  This is the demo's moment.
- **Hook** `preCheck`/`postCheck`: settle window accounting and emit
  `SpendAllowed(account, target, amount)` / `SpendBlocked(account, target, amount, reason)`
  for the live dashboard panel.
- **Session key** (scoped validator config): the autonomous agent gets a key allowed to
  call only `{CreditManager, Byreal router, MerchantMoe}` with selectors
  `{swap, openPosition, repay}`, value bounds, and an expiry. Anything outside reverts.

Per-account config is set on `onInstall(bytes)` (tier defaults pulled from TierMath, or
explicit overrides) and lives in the module keyed by `msg.sender` (the account).

---

## 7. GuardedAccount (AA-independent fallback)

A minimal smart-contract wallet that holds drawn capital and runs the **same**
`SpendingGuardLib` in its `execute` path. Owner (operator) sets config + allowlist;
an agent session signer executes within bounds. Called directly from an EOA/relayer —
no bundler, no paymaster — so the rogue-tx revert is guaranteed for the live demo even
if Pimlico/Kernel are unavailable on Mantle.

```solidity
function execute(address target, uint256 value, bytes calldata data) external onlyAgentOrOwner;
function setConfig(GuardConfig calldata) external onlyOwner;
function setAllowed(address target, bytes4 selector, bool allowed) external onlyOwner;
function setFrozen(bool) external onlyOwner;
```

Same typed errors as the module → identical dashboard behaviour either way.

---

## 8. Off-chain (engine, indexer, dashboard)

```
Reputation Engine (apps/engine, Node/TS)
  inputs:  Byreal CLI / RealClaw PnL JSON  ·  ERC-8004 Reputation + Validation registries
           ·  Gitcoin/Human Passport (Sybil)
  compute: recency-decayed, Sybil-gated R  (see docs: scoring formula)
  outputs: ReputationOracle.commit()  ·  ERC-8004 tradingYield feedback
           ·  x402 paid endpoint (proofOfPayment → ERC-8004 feedback)
           ·  GLM natural-language explanation of every credit decision

Indexer (Viem watch / Ponder): ERC-8004 feedback · vault/credit events
         · SpendAllowed/SpendBlocked  →  fast reads + live WebSocket for the dashboard

Dashboard (apps/web, Next.js): identity card · reputation gauge · credit tier/limit
         · deployed positions · real-time spending-controls panel (rogue-tx rejection)
```

### Scoring formula (committed inputs, recomputable from `evidenceHash`)

```
raw = w1·z_pnl + w2·win + w3·(1−dd) + w4·cons
    + w5·jobs  + w6·val + w7·age
R   = 1000 · σ(k·raw),  σ(x)=1/(1+e^−x),  k≈1.2
R   ← R·(1 − 0.5·syb)            # Sybil gate, multiplicative
# hard floor: Passport < threshold OR trades < N  ⇒  tier capped at T0
```

Weights (positives sum to 1.0): `w1=0.30 w2=0.15 w3=0.15 w4=0.15 w5=0.08 w6=0.10 w7=0.07`.
Recency: each event of age `t` days weighted `λ = 0.5^(t/30)`; aggregates are λ-weighted
means, so R reacts to new on-chain events as they arrive. Recompute on each indexed event.

---

## Data-flow invariants
- A credit decision is never made off a stale tier: `draw` re-reads the Oracle (or
  requires a `refreshLimit` within the same epoch).
- The vault never disburses to an arbitrary address: `draw` sends only to the line's
  registered `account`.
- The SpendingGuard's allowlist is the *only* gate on outbound capital; the credit limit
  bounds *how much* exists, the guard bounds *where/how fast* it leaves.
- Every state transition above emits an event; the indexer derives all UI state from
  events, never from ad-hoc RPC guesses.
