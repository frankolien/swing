# Live deployment — Mantle Sepolia (chainId 5003)

Deployed 2026-06-05. Deployer / oracle signer: `0x4D6A7d6bF3C0a885D581AacEC0345526bd33273E`.
Explorer: https://explorer.sepolia.mantle.xyz · https://sepolia.mantlescan.xyz

## Contracts

| Contract | Address |
|---|---|
| MockUSDC (vault asset / faucet) | [`0xDA9430BE1F57CAcB96951888DD757a1Af7953dBa`](https://explorer.sepolia.mantle.xyz/address/0xDA9430BE1F57CAcB96951888DD757a1Af7953dBa) |
| ReputationOracle | [`0xAd480D894c734D71d2A1FD9a7Da802131D3c1617`](https://explorer.sepolia.mantle.xyz/address/0xAd480D894c734D71d2A1FD9a7Da802131D3c1617) |
| CreditVault (ERC-4626) | [`0x4DC35935403f683Bcab4c34519756C8458654344`](https://explorer.sepolia.mantle.xyz/address/0x4DC35935403f683Bcab4c34519756C8458654344) |
| CreditManager | [`0x742929798a121F043B629e98647060b18db369c3`](https://explorer.sepolia.mantle.xyz/address/0x742929798a121F043B629e98647060b18db369c3) |
| GuardedAccountFactory | [`0x5bd77f46D4c557358409Ca47e8c79A7A3eA4bd44`](https://explorer.sepolia.mantle.xyz/address/0x5bd77f46D4c557358409Ca47e8c79A7A3eA4bd44) |
| SpendingGuardHook (ERC-7579 T4) | [`0xd679EAdad555F0c3b9083e52c2C79f99b713D224`](https://explorer.sepolia.mantle.xyz/address/0xd679EAdad555F0c3b9083e52c2C79f99b713D224) |
| SpendingGuardValidator (ERC-7579 T1) | [`0xa0DDd52B925c893aD6Af3Ba3cCc560cA362aa19c`](https://explorer.sepolia.mantle.xyz/address/0xa0DDd52B925c893aD6Af3Ba3cCc560cA362aa19c) |
| Demo GuardedAccount (agentId 1) | [`0x1A1960bAc3C0852De7De2e5507C7AA1345Bc1C71`](https://explorer.sepolia.mantle.xyz/address/0x1A1960bAc3C0852De7De2e5507C7AA1345Bc1C71) |

Vault seeded with 100,001 USDC liquidity (incl. dead-shares). Canonical record: `contracts/deployments/5003.json`.

## Verified end-to-end demo loop (real txs)

The full north-star sequence, executed on-chain for agentId 1:

| Step | Result | Tx |
|---|---|---|
| 1. Reputation commit | `R = 800` → tier **T3 (Trusted)** | [`0xf100c046…49a4ef`](https://explorer.sepolia.mantle.xyz/tx/0xf100c0467edcbbf3647cbe1dcccc64d745e6c96e374c7a4c561026004849a4ef) |
| 2. Credit line | borrowing power **35,777 USDC** = `creditLimit(800)` | (read) |
| 3. Draw | **5,000 USDC** disbursed to the guarded account | [`0x82f672ff…26aef12`](https://explorer.sepolia.mantle.xyz/tx/0x82f672fff56d3e5a861b50f1eb3c51c1ed59fc1bb5b9fdd94b0085b5a26aef12) |
| 4. Allowed spend | **1,000 USDC** → allowlisted merchant ✅ | [`0x589a730a…d6cae8`](https://explorer.sepolia.mantle.xyz/tx/0x589a730ad98734d85de0b701177e2086afcb8887c71d416e5933c7cdc2d6cae8) |
| 5. **Rogue spend** | → non-allowlisted attacker → **REVERTED on-chain** (`status 0`, block 39548642), attacker balance `0` | [`0x0ec58c2f…34ced2`](https://explorer.sepolia.mantle.xyz/tx/0x0ec58c2f015116ad89fcb558aa8e429ceefac2c20edd7ce2c28bdab26734ced2) |

Step 5 is the prize beat: a real, mined, failed transaction on the Mantle explorer — the
`SpendingGuard` rejecting a drain attempt. `earn → reputation → credit → deploy → safety`,
fully verifiable.

## Notes
- Deploys were done contract-by-contract via `forge create` (the sandboxed `forge script`
  fork backend couldn't hold a stable connection to the public RPC; single sequential txs are
  reliable). Re-deploying from a normal terminal can use `forge script script/Deploy.s.sol
  --broadcast` for a single-command deploy + `deployments/5003.json`.
- **Source verified on Mantlescan** — all 7 contracts + agent 1's `GuardedAccount`, via the
  Etherscan V2 unified endpoint (`--verifier-url "https://api.etherscan.io/v2/api?chainid=5003"`,
  `MANTLESCAN_API_KEY`). Source viewable at `sepolia.mantlescan.xyz/address/<addr>#code`.
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
