import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

// Light, honest Byreal integration. We shell out to the official Byreal Skills CLI
// (@byreal-io/byreal-cli) for READ-ONLY market data — no wallet, no key, no whitelist. Byreal's
// CLMM DEX is on Solana, so this is signal *context* the agent reads, not Mantle PnL: the
// reputation score stays on the DataSource (simulated/historical) and all credit/safety logic
// runs on Mantle. Surfaced and labeled as such in the dashboard.
const execFileAsync = promisify(execFile);
const req = createRequire(import.meta.url);

let cachedBin: string | null | undefined;
function resolveBin(): string | null {
  if (cachedBin !== undefined) return cachedBin;
  try {
    const pkgJson = req.resolve("@byreal-io/byreal-cli/package.json");
    const binRel = (req("@byreal-io/byreal-cli/package.json") as { bin: Record<string, string> })
      .bin?.["byreal-cli"];
    cachedBin = binRel ? resolve(dirname(pkgJson), binRel) : null;
  } catch {
    cachedBin = null;
  }
  return cachedBin;
}

export interface ByrealMarket {
  source: "byreal-cli";
  chain: "solana";
  version: string;
  fetchedAt: number;
  tvlUsd: number;
  tvlChange24h: number;
  volume24hUsd: number;
  volumeChange24h: number;
  fee24hUsd: number;
  poolsCount: number;
}

let cache: { atMs: number; data: ByrealMarket } | null = null;
const TTL_MS = 60_000;

async function runCli<T = unknown>(
  args: string[]
): Promise<{ success: boolean; data?: T; meta?: { version?: string } } | null> {
  const bin = resolveBin();
  if (!bin) return null;
  try {
    const { stdout } = await execFileAsync("node", [bin, ...args, "-o", "json", "--non-interactive"], {
      timeout: 12_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch {
    return null; // CLI missing/slow/offline — caller falls back to cache or null
  }
}

/// Live Byreal CLMM (Solana) overview via the Skills CLI, cached 60s. Returns null if the CLI is
/// unavailable and there's no cached value — the dashboard simply hides the panel in that case.
export async function getByrealMarket(now: number): Promise<ByrealMarket | null> {
  const nowMs = now * 1000;
  if (cache && nowMs - cache.atMs < TTL_MS) return cache.data;

  const res = await runCli<{
    tvl: number;
    tvl_change_24h: number;
    volume_24h_usd: number;
    volume_change_24h: number;
    fee_24h_usd: number;
    pools_count: number;
  }>(["overview"]);

  if (!res?.success || !res.data) return cache?.data ?? null;
  const d = res.data;
  const data: ByrealMarket = {
    source: "byreal-cli",
    chain: "solana",
    version: res.meta?.version ?? "",
    fetchedAt: now,
    tvlUsd: d.tvl,
    tvlChange24h: d.tvl_change_24h,
    volume24hUsd: d.volume_24h_usd,
    volumeChange24h: d.volume_change_24h,
    fee24hUsd: d.fee_24h_usd,
    poolsCount: d.pools_count,
  };
  cache = { atMs: nowMs, data };
  return data;
}

export const byrealAvailable = (): boolean => resolveBin() !== null;
