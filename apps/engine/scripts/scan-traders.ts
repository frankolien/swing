/**
 * Find / vet candidate on-chain traders for the /onchain benchmark (Ticket 6).
 *
 * The engine can only reconstruct PnL from STABLECOIN-LEGGED round-trips, so most addresses
 * (exchanges, whales, contracts, one-way wallets) produce zero trades. This script runs the
 * real reconstruction over candidates and ranks them, so you pick a wallet that actually works.
 *
 * Two modes:
 *   # vet specific addresses you found on mantlescan
 *   pnpm --filter @swing/engine scan 0xabc... 0xdef...
 *
 *   # DISCOVER: pull recent senders to a DEX router and vet them all
 *   pnpm --filter @swing/engine scan --router 0x<merchantMoe|agni|fusionx router> --limit 40
 *
 * Needs MANTLESCAN_API_KEY in .env. Whichever candidate scores best, drop into MANTLE_TRADER_ADDRESS.
 */
import { MANTLESCAN_API_KEY } from "../src/config.js";
import { buildOnchainRecord } from "../src/data/mantleOnchain.js";
import { computeScore } from "../src/scoring.js";

const V2 = "https://api.etherscan.io/v2/api";
const CHAIN = 5000; // Mantle mainnet

async function recentSenders(router: string, limit: number): Promise<string[]> {
  const url = `${V2}?chainid=${CHAIN}&module=account&action=txlist&address=${router}&page=1&offset=400&sort=desc&apikey=${MANTLESCAN_API_KEY}`;
  const res = await fetch(url);
  const j = (await res.json()) as { result?: Array<{ from: string }> };
  const seen = new Set<string>();
  for (const t of Array.isArray(j.result) ? j.result : []) {
    const f = t.from?.toLowerCase();
    if (f && f !== router.toLowerCase()) seen.add(f);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

async function main() {
  if (!MANTLESCAN_API_KEY) {
    console.error("set MANTLESCAN_API_KEY in .env first");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  let candidates: string[] = [];

  const rIdx = args.indexOf("--router");
  if (rIdx !== -1) {
    const router = args[rIdx + 1];
    const lIdx = args.indexOf("--limit");
    const limit = lIdx !== -1 ? Number(args[lIdx + 1]) : 30;
    console.log(`discovering up to ${limit} recent senders to ${router}…`);
    candidates = await recentSenders(router, limit);
  } else {
    candidates = args.filter((a) => a.startsWith("0x"));
  }

  if (!candidates.length) {
    console.error("usage: scan <addr...>   |   scan --router <addr> [--limit N]");
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  type Row = {
    addr: string;
    score: number;
    tier: number;
    closed: number;
    pnl: number;
    win: number;
    swaps: number;
    span: number;
  };
  const rows: Row[] = [];
  for (const addr of candidates) {
    const empty: Row = { addr, score: 0, tier: 0, closed: 0, pnl: 0, win: 0, swaps: 0, span: 0 };
    try {
      const rec = await buildOnchainRecord(addr, now);
      if (!rec) {
        rows.push(empty);
      } else {
        const s = rec.summary;
        // Rank by the engine's OWN reputation score — a benchmark wallet should be one the
        // engine rates highly (rewards win-rate, positive risk-adjusted PnL, consistency), which
        // naturally ranks profitable traders above high-volume break-even bots.
        const sc = computeScore(rec.scoreInputs);
        rows.push({ addr, score: sc.score, tier: sc.tier, closed: s.closedTrades, pnl: s.realizedPnl, win: s.winRate, swaps: s.swaps, span: s.spanDays });
      }
    } catch {
      rows.push(empty);
    }
    process.stdout.write("."); // progress
  }
  process.stdout.write("\n\n");

  // primary sort by engine score (the reputation the benchmark would carry), then by trade count
  rows.sort((a, b) => b.score - a.score || b.closed - a.closed);
  console.log("rank  score  tier  closed  swaps   realizedPnl   win%   spanD  address");
  rows.forEach((r, i) => {
    if (r.closed === 0 && r.swaps === 0) return; // hide dead wallets
    const pnl = (r.pnl >= 0 ? "+" : "") + r.pnl.toFixed(0);
    console.log(
      `${String(i + 1).padStart(3)}  ${String(r.score).padStart(5)}  T${r.tier}    ${String(r.closed).padStart(6)}  ${String(r.swaps).padStart(5)}  ${pnl.padStart(12)}  ${String(Math.round(r.win * 100)).padStart(4)}  ${String(r.span).padStart(6)}  ${r.addr}`
    );
  });
  // pick the highest-reputation wallet with a real track record (>= 5 trades clears the T0 floor)
  const best = rows.find((r) => r.closed >= 5) ?? rows.find((r) => r.closed > 0);
  if (best) {
    console.log(`\n✅ best benchmark: ${best.addr}`);
    console.log(`   engine score ${best.score}/1000 (T${best.tier}) · ${best.closed} trades · ${Math.round(best.win * 100)}% win · ${(best.pnl >= 0 ? "+" : "") + best.pnl.toFixed(0)} PnL`);
    console.log(`   set it: MANTLE_TRADER_ADDRESS=${best.addr}  in .env, then restart the engine`);
  } else {
    console.log("\n⚠️  none produced clean stablecoin-legged trades — try a different router / addresses");
  }
}

main();
