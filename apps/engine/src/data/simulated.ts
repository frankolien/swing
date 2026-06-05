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

  private seed(agentId: bigint, now: number): AgentState {
    // 10 trades over the last ~40 days: a 60% win rate with real drawdowns -> high T2.
    const pnls = [120, -90, 140, 80, -110, 95, 130, -70, 60, 150];
    const trades: Trade[] = pnls.map((pnl, i) => ({
      timestamp: now - (40 - i * 3) * DAY,
      pnl,
      ret: pnl / 2000,
      win: pnl > 0,
    }));
    const validations: ValidationEvent[] = [
      { timestamp: now - 5 * DAY, response: 82 },
      { timestamp: now - 2 * DAY, response: 88 },
    ];
    return {
      trades,
      validations,
      jobsCompleted: 9,
      accountAgeDays: 95,
      passportScore: 22,
      earned: 0,
    };
  }

  private state(agentId: bigint, now: number): AgentState {
    const key = agentId.toString();
    let s = this.agents.get(key);
    if (!s) {
      s = this.seed(agentId, now);
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
