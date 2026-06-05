import type { ScoreInputs, Trade, ValidationEvent } from "../scoring.js";
import type { DataSource } from "./source.js";

const DAY = 86_400;

interface AgentState {
  trades: Trade[];
  validations: ValidationEvent[];
  jobsCompleted: number;
  accountAgeDays: number;
  passportScore: number;
  earned: number; // count of "earn" batches applied
}

/// Deterministic simulated agent: starts as a mid-tier (T2) trader with a flawed track record,
/// and each `earn()` appends a batch of strong winning trades — so repeated earns push R across
/// the 750 threshold into T3, raising the on-chain credit line. No randomness: reproducible.
export class SimulatedSource implements DataSource {
  readonly kind = "simulated";
  private agents = new Map<string, AgentState>();

  private seed(now: number): AgentState {
    // 14 trades over ~45 days: ~86% win rate, shallow drawdowns -> solid T3 baseline that
    // `earn` then pushes higher (no dip against an already-strong on-chain score).
    const pnls = [150, 150, -40, 150, 160, 150, 140, 150, -40, 150, 160, 150, 150, 150];
    const trades: Trade[] = pnls.map((pnl, i) => ({
      timestamp: now - (45 - i * 3) * DAY,
      pnl,
      ret: pnl > 0 ? 0.05 : -0.015,
      win: pnl > 0,
    }));
    const validations: ValidationEvent[] = [
      { timestamp: now - 6 * DAY, response: 92 },
      { timestamp: now - 3 * DAY, response: 95 },
      { timestamp: now - 1 * DAY, response: 94 },
    ];
    return {
      trades,
      validations,
      jobsCompleted: 28,
      accountAgeDays: 220,
      passportScore: 28,
      earned: 0,
    };
  }

  private state(agentId: bigint, now: number): AgentState {
    const key = agentId.toString();
    let s = this.agents.get(key);
    if (!s) {
      s = this.seed(now);
      this.agents.set(key, s);
    }
    return s;
  }

  getInputs(agentId: bigint, now: number): ScoreInputs {
    const s = this.state(agentId, now);
    return {
      trades: s.trades,
      validations: s.validations,
      jobsCompleted: s.jobsCompleted,
      accountAgeDays: s.accountAgeDays,
      passportScore: s.passportScore,
      now,
    };
  }

  earn(agentId: bigint, now: number, count = 4): void {
    const s = this.state(agentId, now);
    const rets = [0.05, 0.055, 0.06];
    for (let i = 0; i < count; i++) {
      s.trades.push({
        timestamp: now - i * 60, // fresh trades, minutes apart
        pnl: 180,
        ret: rets[i % 3]!,
        win: true,
      });
    }
    s.validations.push({ timestamp: now, response: 96 });
    s.jobsCompleted += 2;
    s.earned += 1;
  }
}
