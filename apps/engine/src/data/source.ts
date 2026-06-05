import type { ScoreInputs } from "../scoring.js";

/// Pluggable PnL source. `simulated` is the safe default; a Byreal CLI / RealClaw adapter
/// implements the same interface when whitelist access lands (the rubric values verifiable
/// systems over live mainnet PnL, so simulated is a legitimate, transparently-labeled source).
export interface DataSource {
  readonly kind: string;
  /// Full, current scoring inputs for an agent (history grows as trades arrive).
  getInputs(agentId: bigint, now: number): ScoreInputs;
  /// Simulate new winning trades arriving (the live "earn" beat). No-op for read-only sources.
  earn(agentId: bigint, now: number, count?: number): void;
}
