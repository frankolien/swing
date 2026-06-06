import { tierMeta, creditLimitUsd } from "@swing/shared";
import type { ScoreResult } from "./scoring.js";
import { glmComplete, glmEnabled } from "./glm.js";

const SYSTEM_PROMPT =
  "You are the reputation engine for 'the swing', a credit layer for autonomous AI agents on " +
  "Mantle. Explain a reputation/credit decision in 2-3 crisp, concrete sentences for a technical " +
  "reader. Use ONLY the numbers provided — never invent figures. No markdown, no preamble.";

/// Compact, grounded fact sheet handed to GLM so its prose stays tied to the actual decision.
function factSheet(prev: ScoreResult | undefined, next: ScoreResult): string {
  const t = tierMeta(next.score);
  const c = next.components;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  // NB: no dollar credit limit here — the dashboard's credit panel is the source of truth for that
  // (it reads the on-chain line). GLM narrates score/tier/drivers/stance so the prose can't cite a
  // figure that disagrees with the panel.
  const facts: Record<string, string | number | boolean> = {
    score: `${next.score}/1000`,
    tier: `${t.key} ${t.name}`,
    stance: t.stance,
    winRate: pct(c.win),
    drawdownHealth: pct(c.oneMinusDd),
    consistency: pct(c.consistency),
    validation: pct(c.validation),
    sybilPenalty: pct(c.sybil),
    capped: next.capped,
  };
  if (prev) {
    facts.previousScore = `${prev.score}/1000`;
    facts.previousTier = tierMeta(prev.score).name;
    facts.direction = next.score > prev.score ? "up" : next.score < prev.score ? "down" : "flat";
  }
  return Object.entries(facts)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/// GLM-narrated explanation when Z.ai is configured, else the deterministic template. Never throws
/// — any provider error degrades silently to the template so the decision is always explained.
export async function explain(prev: ScoreResult | undefined, next: ScoreResult): Promise<string> {
  const template = explainScore(prev, next);
  if (!glmEnabled()) return template;
  try {
    return await glmComplete(SYSTEM_PROMPT, factSheet(prev, next));
  } catch (e) {
    console.error("[glm] fell back to template:", (e as Error).message);
    return template;
  }
}

/// Deterministic natural-language explanation of a reputation/credit decision — the always-available
/// baseline and the fallback when GLM is unavailable.
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
