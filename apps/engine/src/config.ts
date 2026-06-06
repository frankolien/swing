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

// Z.ai GLM (sponsor). When ZAI_API_KEY is set the engine narrates decisions with GLM; otherwise
// it falls back to the deterministic template. OpenAI-compatible chat-completions surface.
export const ZAI_API_KEY = process.env.ZAI_API_KEY ?? process.env.Z_AI_API_KEY ?? "";
export const ZAI_BASE_URL = (process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4").replace(/\/+$/, "");
// glm-4.5-flash is Z.ai's free tier (no balance needed) and reasons well enough for short
// decision narration; glm-4.6 is the paid flagship. Override via ZAI_MODEL.
export const ZAI_MODEL = process.env.ZAI_MODEL ?? "glm-4.5-flash";

// The engine's commit signer must equal the on-chain ReputationOracle.signer. We default to
// the deployer key (which is the signer set at deploy) unless a dedicated one is provided.
export const SIGNER_KEY = (process.env.ORACLE_SIGNER_PRIVATE_KEY ||
  process.env.DEPLOYER_PRIVATE_KEY ||
  "") as `0x${string}`;

export function loadDeployment(chainId: number = CHAIN_ID): SwingDeployment {
  const path = resolve(repoRoot, `contracts/deployments/${chainId}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as SwingDeployment;
}

export const deployment = loadDeployment();
