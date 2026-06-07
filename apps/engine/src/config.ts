import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SwingDeployment } from "@swing/shared";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

// .env lives at the repo root; the engine runs from apps/engine.
loadEnv({ path: resolve(repoRoot, ".env") });

export const CHAIN_ID = Number(process.env.MANTLE_SEPOLIA_CHAIN_ID ?? 5003);
export const RPC_URL = process.env.MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
export const PORT = Number(process.env.ENGINE_PORT ?? 8787);
export const DATA_SOURCE = process.env.DATA_SOURCE ?? "simulated";

// Verified on-chain Mantle trading: we read a real trader's DEX swaps (Merchant Moe / Agni on
// Mantle MAINNET, chain 5000) via the Etherscan V2 account API and reconstruct realized PnL from
// stablecoin legs. Reused Mantlescan key. Default address is a live two-sided trader.
export const MANTLESCAN_API_KEY = process.env.MANTLESCAN_API_KEY ?? "";
export const MANTLE_TRADER_ADDRESS = (
  process.env.MANTLE_TRADER_ADDRESS ?? "0xc1ed7ed164ed8a8019b694444dd3c606c7ceff26"
).toLowerCase();
export const MANTLE_MAINNET_EXPLORER = process.env.MANTLE_MAINNET_EXPLORER ?? "https://mantlescan.xyz";

// Provenance for the on-chain trader, surfaced in the UI so the benchmark is framed honestly.
// To benchmark a specific RealClaw / competition agent, set MANTLE_TRADER_ADDRESS to its wallet
// and override the label/note. We default to a curated wallet because clean PnL reconstruction
// needs stablecoin-legged round-trips, which most addresses don't have (see docs/STATUS.md).
export const MANTLE_TRADER_LABEL = process.env.MANTLE_TRADER_LABEL ?? "Independent Mantle trader";
export const MANTLE_TRADER_NOTE =
  process.env.MANTLE_TRADER_NOTE ??
  "Curated reference wallet — a live two-sided stablecoin trader on Mantle mainnet, scored by the same engine. Point MANTLE_TRADER_ADDRESS at a RealClaw agent to benchmark it directly.";

// Z.ai GLM (sponsor). When ZAI_API_KEY is set the engine narrates decisions with GLM; otherwise
// it falls back to the deterministic template. OpenAI-compatible chat-completions surface.
export const ZAI_API_KEY = process.env.ZAI_API_KEY ?? process.env.Z_AI_API_KEY ?? "";
export const ZAI_BASE_URL = (process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4").replace(/\/+$/, "");
// glm-4.5-flash is Z.ai's free tier (no balance needed) and reasons well enough for short
// decision narration; glm-4.6 is the paid flagship. Override via ZAI_MODEL.
export const ZAI_MODEL = process.env.ZAI_MODEL ?? "glm-4.5-flash";

// The engine's commit signer must be a member of the on-chain ReputationOracle committee. We
// default to the deployer key (the signer set at deploy) unless a dedicated one is provided.
export const SIGNER_KEY = (process.env.ORACLE_SIGNER_PRIVATE_KEY ||
  process.env.DEPLOYER_PRIVATE_KEY ||
  "") as `0x${string}`;

// Committee oracle: when the deployed ReputationOracle is a k-of-n committee, the engine must
// hold `threshold` of its signer keys to assemble a quorum. Provide them comma-separated in
// ORACLE_SIGNER_KEYS; otherwise it falls back to the single SIGNER_KEY (a 1-of-1 committee).
export const ORACLE_SIGNER_KEYS = (process.env.ORACLE_SIGNER_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean) as `0x${string}`[];

export function loadDeployment(chainId: number = CHAIN_ID): SwingDeployment {
  const path = resolve(repoRoot, `contracts/deployments/${chainId}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as SwingDeployment;
}

export const deployment = loadDeployment();
