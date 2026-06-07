# Live deployment — Mantle Sepolia (chainId 5003)

Redeployed 2026-06-07 with the **2-of-3 committee ReputationOracle**. Deployer / owner:
`0x4D6A7d6bF3C0a885D581AacEC0345526bd33273E`. Oracle committee (threshold 2):
`0x5ce5E9FE1705dA5A26F3bfC3BA56Dd6a02164720`, `0x931Cca571AdaE525D33Db36c78727B9Ec99C662a`,
and the deployer. Explorer: https://explorer.sepolia.mantle.xyz · https://sepolia.mantlescan.xyz

## Contracts

| Contract | Address |
|---|---|
| MockUSDC (vault asset / faucet) | [`0xa29799A188C220B17788a355Ec0166523172B09d`](https://explorer.sepolia.mantle.xyz/address/0xa29799A188C220B17788a355Ec0166523172B09d) |
| ReputationOracle (2-of-3 committee) | [`0xe00962601106D055be7A1f97CD53c9C7B4b46632`](https://explorer.sepolia.mantle.xyz/address/0xe00962601106D055be7A1f97CD53c9C7B4b46632) |
| CreditVault (ERC-4626) | [`0x0aD20c99D72AA4371317a85A85Ce39C318a2b114`](https://explorer.sepolia.mantle.xyz/address/0x0aD20c99D72AA4371317a85A85Ce39C318a2b114) |
| CreditManager | [`0x1be497f127561a8F3e53aF53452Ce6cdC09e31a8`](https://explorer.sepolia.mantle.xyz/address/0x1be497f127561a8F3e53aF53452Ce6cdC09e31a8) |
| GuardedAccountFactory | [`0xB1ccd35E453eB0a4eeD05a3AE0BFC638B397B997`](https://explorer.sepolia.mantle.xyz/address/0xB1ccd35E453eB0a4eeD05a3AE0BFC638B397B997) |
| SpendingGuardHook (ERC-7579 T4) | [`0x9A0735F793e438b63241252EB54ef7B519E698Bb`](https://explorer.sepolia.mantle.xyz/address/0x9A0735F793e438b63241252EB54ef7B519E698Bb) |
| SpendingGuardValidator (ERC-7579 T1) | [`0x60C3C40566a932bAcA3AfD23699C38e9F0F3E2C3`](https://explorer.sepolia.mantle.xyz/address/0x60C3C40566a932bAcA3AfD23699C38e9F0F3E2C3) |
| Demo GuardedAccount (agentId 1) | [`0xA6f857F91C57f6DaC7BAf5F4A2abfA026A729365`](https://explorer.sepolia.mantle.xyz/address/0xA6f857F91C57f6DaC7BAf5F4A2abfA026A729365) |

Vault seeded with 100,001 USDC liquidity (incl. dead-shares). Canonical record: `contracts/deployments/5003.json`.

## Verified end-to-end demo loop (real txs)

The full north-star sequence, executed on-chain for agentId 1:

| Step | Result | Tx |
|---|---|---|
| 1. Reputation commit | `R = 832` → tier **T3 (Trusted)**, via the **2-of-3 committee** | [`0x731c624f…b83dc`](https://explorer.sepolia.mantle.xyz/tx/0x731c624fb9b1e3dfd32bbb6e41b3ad45924d5510587ebfb2b7e300ccdf5b83dc) |
| 2. Credit line | borrowing power **37,945 USDC** = `creditLimit(832)` | [`0xcb3ec6f5…bf265`](https://explorer.sepolia.mantle.xyz/tx/0xcb3ec6f549293339f92b6c0398af3b216f5853562606986c622ea8fc7c9bf265) |
| 3. Draw | **5,000 USDC** disbursed to the guarded account | [`0xb0746f28…11e9c`](https://explorer.sepolia.mantle.xyz/tx/0xb0746f283819fa9dcee92a52013c6d57cbf014f290a60e30f6320e8ae7611e9c) |
| 4. Allowed spend | **1,000 USDC** → allowlisted merchant ✅ | [`0x9147444b…2f8a2`](https://explorer.sepolia.mantle.xyz/tx/0x9147444b664c4a67c5803569269ff0147ea9d169ac51e38a5b34a057fad2f8a2) |
| 5. **Rogue spend** | → non-allowlisted attacker → **REVERTED on-chain** (`status 0`), attacker balance `0` | [`0x16d6faaf…35ff7`](https://explorer.sepolia.mantle.xyz/tx/0x16d6faaff4087db6fe47647cc563bb75114f90dd6a02a856f8f86ce1f5335ff7) |

Step 5 is the prize beat: a real, mined, failed transaction on the Mantle explorer — the
`SpendingGuard` rejecting a drain attempt. `earn → reputation → credit → deploy → safety`,
fully verifiable.

## Notes
- The committee redeploy used a single-command `forge script script/Deploy.s.sol --broadcast
  --slow` (the `--slow` flag sends one tx at a time, which is reliable on the public RPC) and
  rewrote `deployments/5003.json`. Set `ORACLE_SIGNER_2`/`ORACLE_SIGNER_3` + `ORACLE_THRESHOLD=2`
  for the 2-of-3; the engine signs commits with `ORACLE_SIGNER_KEYS` and auto-detects the oracle.
- **Source verified on Mantlescan** — all 7 contracts, via the Etherscan V2 unified endpoint
  (`--verifier-url "https://api.etherscan.io/v2/api?chainid=5003"`, `MANTLESCAN_API_KEY`). The
  committee `ReputationOracle` verified with its `(address[],uint256)` constructor args; the
  others matched by bytecode. Source viewable at `sepolia.mantlescan.xyz/address/<addr>#code`.
- MockUSDC has an open `mint` — it's the demo faucet token. Swap for a real Mantle asset
  (USDC/USDY) for a mainnet build.

## Reputation Engine (apps/engine) — live, auto-committing

Backend: viem client (`batch:false` + retries for the flaky public RPC) → scoring → on-chain
`ReputationOracle.commit`. Run it: `ENGINE_PORT=8799 pnpm --filter @swing/engine start`
(8787 may be taken locally). Endpoints:

- `GET /health` · `GET /deployment` · `GET /agents/:id` · `GET /events`
- `POST /agents/:id/recompute` — score from current trades → commit on-chain
- `POST /agents/:id/earn` — simulate new winning trades → recompute → commit (the live beat)
- `POST /preview-spend` — guard reason code for a proposed spend

Engine-driven demo (agentId 2, simulated source — each step a real commit tx):

| Action | Score | Tier | Note |
|---|---|---|---|
| recompute | 671 | T2 | win-rate 71%, with real drawdowns |
| earn | 723 | T2 | |
| earn | **753** | **T3** | promoted → limit raised to ~$32,671 (20% under-collateralized) |
| earn | 775 | T3 | |

Final on-chain: `scoreOf(2)=775`, `tierOf(2)=3`. Every commit carries an `evidenceHash` binding it
to the exact inputs (recomputable/auditable). NL explanations are **live via Z.ai GLM**
(`glm-4.5-flash`, `/health` → `explainer: glm`), with the deterministic template as a silent
fallback on missing key / provider error.
