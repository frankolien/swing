import { tierMeta, creditLimitUsd } from "@swing/shared";
import type { ScoreResult } from "./scoring.js";

/// Natural-language explanation of a reputation/credit decision. Deterministic template for now;
/// swap the body for a Z.ai GLM call (sponsor + judge) behind the same signature later.
export function explainScore(prev: ScoreResult | undefined, next: ScoreResult): string {
  const t = tierMeta(next.score);
  const limit = Math.round(creditLimitUsd(next.score));
  const c = next.components;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const bits: string[] = [];

  if (prev && prev.score !== next.score) {
    bits.push(`Reputation ${prev.score} → ${next.score}/1000 (${t.key} ${t.name}).`);
  } else {
    bits.push(`Reputation ${next.score}/1000 (${t.key} ${t.name}).`);
  }

  if (prev && next.tier > prev.tier) {
    bits.push(
      `Promoted to ${t.name}: credit limit raised to ~$${limit.toLocaleString()} at ${t.stance}.`
    );
  } else if (prev && next.tier < prev.tier) {
    bits.push(`Demoted to ${t.name}: credit limit cut to ~$${limit.toLocaleString()}.`);
  }

  bits.push(
    `Drivers — win-rate ${pct(c.win)}, drawdown-health ${pct(c.oneMinusDd)}, consistency ${pct(
      c.consistency
    )}, validation ${pct(c.validation)}.`
  );
  if (c.sybil > 0) bits.push(`Sybil penalty ${pct(c.sybil)} applied (low Passport).`);
  if (next.capped) bits.push(`Capped at the lowest tier: thin history or failed Passport gate.`);

  return bits.join(" ");
}
