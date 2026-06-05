/**
 * The swing reputation scoring engine — pure, deterministic, recency-decayed, Sybil-gated.
 *
 * Implements docs/ARCHITECTURE.md §8. All event aggregates are λ-weighted means with
 * half-life 30 days, so the score reacts to new on-chain events as they arrive. The result
 * `score` is committed on-chain via ReputationOracle.commit(agentId, score, evidenceHash);
 * `evidenceHash` binds the commit to these exact inputs so anyone can recompute and audit.
 *
 *   raw = w1·z_pnl + w2·win + w3·(1−dd) + w4·cons + w5·jobs + w6·val + w7·age
 *   R   = 1000·σ(k·raw),  then  R ← R·(1 − 0.5·syb)
 *   hard floor: passport < threshold OR trades < N  ⇒  capped at T0
 */
import { keccak256, stringToHex } from "viem";
import { tierOf, type TierId } from "@swing/shared";

const HALF_LIFE_DAYS = 30;
const K = 1.2;
const JOBS_SATURATION = 50;
const AGE_SATURATION_DAYS = 365;
const DAY_SECONDS = 86_400;

export const WEIGHTS = {
  pnl: 0.3,
  win: 0.15,
  drawdown: 0.15,
  consistency: 0.15,
  jobs: 0.08,
  validation: 0.1,
  age: 0.07,
} as const;

export const SYBIL_GATE = 0.5; // R ← R·(1 − 0.5·syb)
export const MIN_TRADES_FOR_CREDIT = 5;
export const DEFAULT_PASSPORT_THRESHOLD = 15;

export interface Trade {
  timestamp: number; // unix seconds
  pnl: number; // realized PnL for the trade, in quote/USD
  ret: number; // period return as a fraction (for the Sharpe-like consistency term)
  win: boolean;
}

export interface ValidationEvent {
  timestamp: number;
  response: number; // 0..100
}

export interface ScoreInputs {
  trades: Trade[];
  validations: ValidationEvent[];
  jobsCompleted: number;
  accountAgeDays: number;
  passportScore: number;
  passportThreshold?: number;
  cohortPnlMean?: number;
  cohortPnlStd?: number;
  now: number; // injected for determinism
}

export interface ScoreComponents {
  zPnl: number;
  win: number;
  oneMinusDd: number;
  consistency: number;
  jobs: number;
  validation: number;
  age: number;
  sybil: number;
}

export interface ScoreResult {
  score: number; // 0..1000
  tier: TierId;
  raw: number;
  components: ScoreComponents;
  capped: boolean; // hard floor applied
  evidenceHash: `0x${string}`;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** λ = 0.5^(ageDays / halfLife) */
export function recencyWeight(ageDays: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

function weightedMean(values: number[], weights: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    num += values[i]! * weights[i]!;
    den += weights[i]!;
  }
  return den === 0 ? 0 : num / den;
}

function weightedStd(values: number[], weights: number[], mean: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    num += weights[i]! * (values[i]! - mean) ** 2;
    den += weights[i]!;
  }
  return den === 0 ? 0 : Math.sqrt(num / den);
}

/** Max drawdown of the cumulative-PnL equity curve, normalized to [0,1] (lower is better). */
function maxDrawdown(trades: Trade[]): number {
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    if (peak > 0) maxDd = Math.max(maxDd, (peak - equity) / peak);
  }
  return clamp(maxDd, 0, 1);
}

export function computeScore(inputs: ScoreInputs): ScoreResult {
  const { trades, validations, now } = inputs;
  const threshold = inputs.passportThreshold ?? DEFAULT_PASSPORT_THRESHOLD;

  const ageDays = (ts: number) => (now - ts) / DAY_SECONDS;
  const tradeW = trades.map((t) => recencyWeight(ageDays(t.timestamp)));
  const valW = validations.map((v) => recencyWeight(ageDays(v.timestamp)));

  // pnl → z-score vs cohort, clipped [-3,3]
  const wPnl = weightedMean(trades.map((t) => t.pnl), tradeW);
  const cohortMean = inputs.cohortPnlMean ?? 0;
  const cohortStd =
    inputs.cohortPnlStd ?? Math.max(1, weightedStd(trades.map((t) => t.pnl), tradeW, wPnl));
  const zPnl = clamp((wPnl - cohortMean) / cohortStd, -3, 3);

  // win rate [0,1]
  const win = weightedMean(trades.map((t) => (t.win ? 1 : 0)), tradeW);

  // drawdown [0,1] (lower better) → use (1 − dd)
  const oneMinusDd = 1 - maxDrawdown(trades);

  // consistency: Sharpe-like mean/σ of period returns, squashed to [0,1]
  const retMean = weightedMean(trades.map((t) => t.ret), tradeW);
  const retStd = weightedStd(trades.map((t) => t.ret), tradeW, retMean);
  const sharpe = retStd === 0 ? 0 : retMean / retStd;
  const consistency = sigmoid(sharpe);

  // jobs: log-scaled [0,1]
  const jobs = clamp(Math.log1p(inputs.jobsCompleted) / Math.log1p(JOBS_SATURATION), 0, 1);

  // validation: avg response/100 [0,1]
  const validation = clamp(weightedMean(validations.map((v) => v.response), valW) / 100, 0, 1);

  // age: log-scaled [0,1]
  const age = clamp(Math.log1p(inputs.accountAgeDays) / Math.log1p(AGE_SATURATION_DAYS), 0, 1);

  // Sybil penalty [0,1] from passport shortfall
  const sybil = clamp((threshold - inputs.passportScore) / threshold, 0, 1);

  const raw =
    WEIGHTS.pnl * zPnl +
    WEIGHTS.win * win +
    WEIGHTS.drawdown * oneMinusDd +
    WEIGHTS.consistency * consistency +
    WEIGHTS.jobs * jobs +
    WEIGHTS.validation * validation +
    WEIGHTS.age * age;

  let score = 1000 * sigmoid(K * raw);
  score = score * (1 - SYBIL_GATE * sybil); // multiplicative Sybil gate

  // hard floor: thin history or failed Sybil check ⇒ cap at the lowest tier
  const capped = inputs.passportScore < threshold || trades.length < MIN_TRADES_FOR_CREDIT;
  if (capped) score = Math.min(score, 249);

  const finalScore = Math.round(clamp(score, 0, 1000));
  const components: ScoreComponents = {
    zPnl,
    win,
    oneMinusDd,
    consistency,
    jobs,
    validation,
    age,
    sybil,
  };

  return {
    score: finalScore,
    tier: tierOf(finalScore),
    raw,
    components,
    capped,
    evidenceHash: evidenceHashOf(inputs, finalScore),
  };
}

/** Deterministic keccak256 over the canonical inputs + result. Committed on-chain. */
export function evidenceHashOf(inputs: ScoreInputs, score: number): `0x${string}` {
  const canonical = JSON.stringify({
    v: 1,
    score,
    weights: WEIGHTS,
    k: K,
    halfLifeDays: HALF_LIFE_DAYS,
    trades: inputs.trades,
    validations: inputs.validations,
    jobsCompleted: inputs.jobsCompleted,
    accountAgeDays: inputs.accountAgeDays,
    passportScore: inputs.passportScore,
    now: inputs.now,
  });
  return keccak256(stringToHex(canonical));
}
