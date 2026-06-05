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
