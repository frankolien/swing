import { MANTLESCAN_API_KEY } from "../config.js";
import type { ScoreInputs, Trade } from "../scoring.js";
import type { TradeView, TrackRecord } from "./source.js";

// Verified on-chain Mantle trading record. We pull a real address's ERC-20 transfers on Mantle
// MAINNET (chain 5000) via the Etherscan V2 account API, group them by tx into swaps, and
// reconstruct realized PnL in USD using stablecoin legs as the numéraire (avg-cost basis). No
// price oracle, no wallet — every trade is a public Mantle tx a judge can click. Tokens acquired
// off-DEX have no observable cost basis, so only stable-denominated round-trips become PnL trades;
// the rest still count as verified activity.
const V2 = "https://api.etherscan.io/v2/api";
const CHAIN = 5000;
const STABLES = new Set(["USDC", "USDT", "USDT0", "USDe", "USDY", "mUSD", "axlUSDC"]);

interface TokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  timeStamp: string;
}

export interface OnchainTrade {
  timestamp: number;
  symbol: string;
  pnl: number; // realized, USD
  ret: number; // pnl / cost basis
  win: boolean;
  hash: string;
}

export interface OnchainRecord {
  address: string;
  venue: string;
  fetchedAt: number;
  summary: {
    swaps: number;
    closedTrades: number;
    realizedPnl: number;
    winRate: number;
    spanDays: number;
    openPositions: number;
  };
  trades: OnchainTrade[]; // newest first
  scoreInputs: ScoreInputs;
  track: TrackRecord;
}

async function fetchTokenTx(address: string): Promise<TokenTx[]> {
  const url = `${V2}?chainid=${CHAIN}&module=account&action=tokentx&address=${address}&page=1&offset=400&sort=asc&apikey=${MANTLESCAN_API_KEY}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const j = (await res.json()) as { result?: unknown };
    return Array.isArray(j.result) ? (j.result as TokenTx[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

const amount = (l: TokenTx) => Number(l.value) / 10 ** Number(l.tokenDecimal || "0");

/// Build the verified on-chain record for `address`. Returns null if no key or no data.
export async function buildOnchainRecord(address: string, now: number): Promise<OnchainRecord | null> {
  if (!MANTLESCAN_API_KEY) return null;
  const rows = await fetchTokenTx(address);
  if (!rows.length) return null;
  const addr = address.toLowerCase();

  const byHash = new Map<string, TokenTx[]>();
  for (const t of rows) {
    const list = byHash.get(t.hash) ?? [];
    list.push(t);
    byHash.set(t.hash, list);
  }

  const pos = new Map<string, { qty: number; cost: number }>();
  const trades: OnchainTrade[] = [];
  const swapHashes = new Set<string>();
  let first = Infinity;
  let last = 0;

  const ordered = [...byHash.entries()].sort(
    (a, b) => Number(a[1][0]!.timeStamp) - Number(b[1][0]!.timeStamp)
  );
  for (const [hash, legs] of ordered) {
    const ins = legs.filter((l) => l.to.toLowerCase() === addr);
    const outs = legs.filter((l) => l.from.toLowerCase() === addr);
    if (ins.length !== 1 || outs.length !== 1) continue; // skip multi-hop/LP for clean reconstruction
    const i = ins[0]!;
    const o = outs[0]!;
    const ts = Number(i.timeStamp);
    swapHashes.add(hash);
    first = Math.min(first, ts);
    last = Math.max(last, ts);

    if (STABLES.has(o.tokenSymbol) && !STABLES.has(i.tokenSymbol)) {
      // BUY token i with stable o
      const p = pos.get(i.tokenSymbol) ?? { qty: 0, cost: 0 };
      p.qty += amount(i);
      p.cost += amount(o);
      pos.set(i.tokenSymbol, p);
    } else if (STABLES.has(i.tokenSymbol) && !STABLES.has(o.tokenSymbol)) {
      // SELL token o for stable i — realize against avg cost
      const p = pos.get(o.tokenSymbol);
      if (p && p.qty > 1e-9) {
        const avg = p.cost / p.qty;
        const q = Math.min(amount(o), p.qty);
        const costBasis = avg * q;
        const pnl = amount(i) - costBasis;
        p.qty -= q;
        p.cost -= costBasis;
        trades.push({
          timestamp: ts,
          symbol: o.tokenSymbol,
          pnl,
          ret: costBasis > 0 ? pnl / costBasis : 0,
          win: pnl > 0,
          hash,
        });
      }
    }
  }

  const realizedPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const wins = trades.filter((t) => t.win).length;
  const winRate = trades.length ? wins / trades.length : 0;
  const spanDays = last > first ? (last - first) / 86_400 : 0;
  const openPositions = [...pos.values()].filter((p) => p.qty > 1e-6).length;

  // equity curve + drawdown
  const equity: number[] = [];
  let eq = 0;
  for (const t of trades) {
    eq += t.pnl;
    equity.push(eq);
  }
  let peak = 0;
  let maxDrawdown = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - e) / peak);
  }
  const rets = trades.map((t) => t.ret);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const sharpe = variance > 0 ? mean / Math.sqrt(variance) : 0;

  const scoreTrades: Trade[] = trades.map((t) => ({
    timestamp: t.timestamp,
    pnl: t.pnl,
    ret: t.ret,
    win: t.win,
  }));
  const scoreInputs: ScoreInputs = {
    trades: scoreTrades,
    validations: [], // none on-chain; reputation leans on verified trades + longevity
    jobsCompleted: swapHashes.size,
    accountAgeDays: Math.max(1, Math.round(spanDays)),
    passportScore: 18,
    now,
  };

  const view: TradeView[] = trades
    .slice(-14)
    .reverse()
    .map((t) => ({ timestamp: t.timestamp, pnl: t.pnl, win: t.win }));

  const track: TrackRecord = {
    venue: "Merchant Moe · Agni · Mantle",
    trades: view,
    summary: { count: trades.length, winRate, realizedPnl, sharpe, maxDrawdown, equity },
  };

  return {
    address,
    venue: "Merchant Moe · Agni · Mantle",
    fetchedAt: now,
    summary: {
      swaps: swapHashes.size,
      closedTrades: trades.length,
      realizedPnl,
      winRate,
      spanDays: Math.round(spanDays * 10) / 10,
      openPositions,
    },
    trades: trades.slice().reverse(),
    scoreInputs,
    track,
  };
}
