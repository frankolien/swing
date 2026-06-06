import type { ScoreInputs } from "../scoring.js";

export interface TradeView {
  timestamp: number;
  pnl: number;
  win: boolean;
}

export interface TrackRecord {
  venue: string;
  trades: TradeView[]; // newest first, recent slice
  summary: {
    count: number;
    winRate: number; // 0..1
    realizedPnl: number;
    sharpe: number;
    maxDrawdown: number; // 0..1
    equity: number[]; // cumulative PnL curve, chronological
  };
}

/// Pluggable PnL source. `simulated` is the safe default; a Byreal CLI / RealClaw adapter
/// implements the same interface when whitelist access lands (the rubric values verifiable
/// systems over live mainnet PnL, so simulated is a legitimate, transparently-labeled source).
export interface DataSource {
  readonly kind: string;
  /// Full, current scoring inputs for an agent (history grows as trades arrive).
  getInputs(agentId: bigint, now: number): ScoreInputs;
  /// The agent's trading track record — the visible "what are we trading" surface.
  getTrack(agentId: bigint, now: number): TrackRecord;
  /// Simulate the agent executing new winning trades; returns the trades it just made.
  earn(agentId: bigint, now: number, count?: number): TradeView[];
  /// Record a completed, paid job (x402 proof-of-payment) as positive reputation evidence.
  recordPaidJob(agentId: bigint, now: number): void;
}
