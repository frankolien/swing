/**
 * TypeScript mirror of contracts/src/libraries/TierMath.sol. The chain is authoritative
 * (read limits from CreditManager.getLine); this mirror is for pre-line previews and UX.
 * Keep the numbers in lockstep with TierMath.sol — they are the same source table.
 */

export const SCORE_MAX = 1000;
const BASE_LIMIT_USD = 50_000;
const GAMMA = 1.5;
const USDC = 1_000_000n; // 6 decimals

export type TierId = 0 | 1 | 2 | 3;

export interface TierMeta {
  id: TierId;
  key: "T0" | "T1" | "T2" | "T3";
  name: string;
  minScore: number;
  capUsd: number;
  /** collateral factor in bps; borrowing power = collateral * 1e4 / cfBps + allowance */
  cfBps: number;
  perTxUsd: number;
  dailyUsd: number;
  /** human label for the collateralization stance */
  stance: string;
}

export const TIERS: readonly TierMeta[] = [
  { id: 0, key: "T0", name: "Unproven", minScore: 0, capUsd: 100, cfBps: 15000, perTxUsd: 25, dailyUsd: 50, stance: "150% over-collateralized" },
  { id: 1, key: "T1", name: "Emerging", minScore: 250, capUsd: 1_000, cfBps: 10000, perTxUsd: 250, dailyUsd: 500, stance: "100% fully collateralized" },
  { id: 2, key: "T2", name: "Established", minScore: 500, capUsd: 10_000, cfBps: 5000, perTxUsd: 2_000, dailyUsd: 5_000, stance: "50% partial" },
  { id: 3, key: "T3", name: "Trusted", minScore: 750, capUsd: 50_000, cfBps: 2000, perTxUsd: 10_000, dailyUsd: 25_000, stance: "20% under-collateralized" },
] as const;

export function tierOf(score: number): TierId {
  if (score >= 750) return 3;
  if (score >= 500) return 2;
  if (score >= 250) return 1;
  return 0;
}

export function tierMeta(score: number): TierMeta {
  return TIERS[tierOf(score)]!;
}

/** limit = BASE_LIMIT * (score/1000)^1.5, clamped to the tier cap (USD, for display). */
export function creditLimitUsd(score: number): number {
  if (score <= 0) return 0;
  const s = Math.min(score, SCORE_MAX);
  const raw = BASE_LIMIT_USD * Math.pow(s / 1000, GAMMA);
  return Math.min(raw, tierMeta(s).capUsd);
}

export function creditLimitBaseUnits(score: number): bigint {
  return BigInt(Math.floor(creditLimitUsd(score) * 1e6));
}

export const toBaseUnits = (usd: number): bigint => BigInt(Math.round(usd * Number(USDC)));
export const fromBaseUnits = (units: bigint): number => Number(units) / Number(USDC);
