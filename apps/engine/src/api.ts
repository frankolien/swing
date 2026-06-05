import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Address } from "viem";
import { SPEND_REASON_LABEL, tierMeta, type SpendReason } from "@swing/shared";
import { CHAIN_ID } from "./config.js";
import { oracle, manager, usdc, addresses, account, guardedAccountAt } from "./chain.js";
import { commitScore } from "./oracle.js";
import { computeScore } from "./scoring.js";
import { getSource } from "./data/index.js";
import { explainScore } from "./explain.js";
import { store } from "./store.js";
import { jsonSafe, nowSec } from "./util.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const source = getSource();

export const app = new Hono();
app.use("*", cors());

app.get("/health", (c) =>
  c.json({ ok: true, chainId: CHAIN_ID, signer: account?.address ?? null, dataSource: source.kind })
);

app.get("/deployment", (c) => c.json(addresses));

app.get("/agents/:id", async (c) => {
  const id = BigInt(c.req.param("id"));
  const reputation = await oracle.read.getReputation([id]);
  const line = await manager.read.getLine([id]);
  let accountUsdc = 0n;
  if (line.account && line.account !== ZERO) {
    accountUsdc = await usdc.read.balanceOf([line.account]);
  }
  return c.json(
    jsonSafe({
      agentId: id.toString(),
      reputation: { ...reputation, tierName: tierMeta(reputation.score).name },
      line,
      accountUsdc,
    })
  );
});

// Recompute the agent's score from current trade data and commit it on-chain.
app.post("/agents/:id/recompute", async (c) => {
  const id = BigInt(c.req.param("id"));
  const { result, txHash } = await commitScore(id, source.getInputs(id, nowSec()));
  return c.json(jsonSafe({ ...result, txHash, explanation: explainScore(undefined, result) }));
});

// Simulate new winning trades arriving, then recompute + commit — the live "earn" beat.
app.post("/agents/:id/earn", async (c) => {
  const id = BigInt(c.req.param("id"));
  const now = nowSec();
  const prev = computeScore(source.getInputs(id, now));
  source.earn(id, now);
  const { result, txHash } = await commitScore(id, source.getInputs(id, nowSec()));
  return c.json(jsonSafe({ prevScore: prev.score, ...result, txHash, explanation: explainScore(prev, result) }));
});

app.get("/events", (c) => c.json(store.recent(50)));

// Off-chain pre-flight: would this spend be blocked, and why?
app.post("/preview-spend", async (c) => {
  const body = (await c.req.json()) as { account: Address; target: Address; value?: string; data?: `0x${string}` };
  const reason = await guardedAccountAt(body.account).read.previewSpend([
    body.target,
    BigInt(body.value ?? "0"),
    body.data ?? "0x",
  ]);
  const code = Number(reason) as SpendReason;
  return c.json({ reason: code, label: SPEND_REASON_LABEL[code] });
});
