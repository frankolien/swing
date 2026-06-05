import { describe, it, expect } from "vitest";
import {
  computeScore,
  recencyWeight,
  evidenceHashOf,
  MIN_TRADES_FOR_CREDIT,
  type ScoreInputs,
  type Trade,
} from "./scoring.js";

const NOW = 1_750_000_000;
const daysAgo = (d: number): number => NOW - d * 86_400;

function winningTrades(count: number, startDaysAgo: number): Trade[] {
  const rets = [0.04, 0.05, 0.06];
  return Array.from({ length: count }, (_, i) => ({
    timestamp: daysAgo(startDaysAgo - i * 0.5),
    pnl: 100,
    ret: rets[i % 3]!,
    win: true,
  }));
}
//wair oo
//testsing again
function baseInputs(over: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    trades: winningTrades(20, 12),
    validations: Array.from({ length: 6 }, (_, i) => ({ timestamp: daysAgo(i), response: 95 })),
    jobsCompleted: 30,
    accountAgeDays: 300,
    passportScore: 25,
    now: NOW,
    ...over,
  };
}

describe("recencyWeight", () => {
  it("halves every 30 days", () => {
    expect(recencyWeight(0)).toBeCloseTo(1, 6);
    expect(recencyWeight(30)).toBeCloseTo(0.5, 6);
    expect(recencyWeight(60)).toBeCloseTo(0.25, 6);
  });
});

describe("computeScore", () => {
  it("a strong, Sybil-clean agent reaches T3", () => {
    const r = computeScore(baseInputs());
    expect(r.score).toBeGreaterThanOrEqual(750);
    expect(r.tier).toBe(3);
    expect(r.capped).toBe(false);
  });

  it("fails the Sybil gate when passport is below threshold (capped at T0)", () => {
    const r = computeScore(baseInputs({ passportScore: 5 }));
    expect(r.capped).toBe(true);
    expect(r.score).toBeLessThanOrEqual(249);
    expect(r.tier).toBe(0);
  });

  it("caps thin trade history at T0 regardless of quality", () => {
    const r = computeScore(baseInputs({ trades: winningTrades(MIN_TRADES_FOR_CREDIT - 1, 5) }));
    expect(r.capped).toBe(true);
    expect(r.tier).toBe(0);
  });

  it("decays old losses so recent good behavior dominates", () => {
    const recentOnly = baseInputs();
    const withOldLosses = baseInputs({
      trades: [
        ...winningTrades(20, 12),
        ...Array.from({ length: 20 }, (_, i) => ({
          timestamp: daysAgo(220 + i),
          pnl: -120,
          ret: -0.06,
          win: false,
        })),
      ],
    });
    const a = computeScore(recentOnly).score;
    const b = computeScore(withOldLosses).score;
    expect(b).toBeGreaterThan(a - 40); // 220-day-old losses barely move the score
    expect(computeScore(withOldLosses).tier).toBeGreaterThanOrEqual(2);
  });

  it("ranks a mediocre agent below a strong one", () => {
    const strong = computeScore(baseInputs()).score;
    const mediocre = computeScore(
      baseInputs({
        trades: Array.from({ length: 20 }, (_, i) => ({
          timestamp: daysAgo(12 - i * 0.5),
          pnl: i % 2 === 0 ? 10 : -8,
          ret: i % 2 === 0 ? 0.01 : -0.012,
          win: i % 2 === 0,
        })),
        jobsCompleted: 2,
        accountAgeDays: 20,
      }),
    ).score;
    expect(mediocre).toBeLessThan(strong);
  });
});

describe("evidenceHash", () => {
  it("is deterministic and input-sensitive", () => {
    const a = evidenceHashOf(baseInputs(), 800);
    const b = evidenceHashOf(baseInputs(), 800);
    const c = evidenceHashOf(baseInputs({ passportScore: 24 }), 800);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
