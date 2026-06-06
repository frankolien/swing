import { Hono } from "hono";
import { cors } from "hono/cors";
import { encodePacked, getAddress, keccak256, type Address } from "viem";
import { SPEND_REASON_LABEL, tierMeta, tierOf, type SpendReason } from "@swing/shared";
import { CHAIN_ID } from "./config.js";
import { oracle, manager, vault, usdc, addresses, account, guardedAccountAt } from "./chain.js";
import { commitScore, commitRaw } from "./oracle.js";
import { executeSpend } from "./spend.js";
import {
  SERVICES,
  X402_VERSION,
  requirements,
  settle,
  verify,
  signalPayload,
  encodeToken,
  encodeSettlement,
  type Service,
  type PaymentRequirements,
} from "./x402.js";
import { computeScore } from "./scoring.js";
import { getSource } from "./data/index.js";
import { explain } from "./explain.js";
import { glmEnabled } from "./glm.js";
import { getByrealMarket, byrealAvailable } from "./byreal.js";
import { buildOnchainRecord, type OnchainRecord } from "./data/mantleOnchain.js";
import { MANTLE_TRADER_ADDRESS, MANTLE_MAINNET_EXPLORER } from "./config.js";
import { store } from "./store.js";
import { getRegistry } from "./registry.js";
import { jsonSafe, nowSec } from "./util.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const source = getSource();

export const app = new Hono();
app.use("*", cors());

// Redeem a verified x402 payment: deliver the resource and loop the proof-of-payment back into
// the provider's ERC-8004 reputation (recompute + on-chain commit). Shared by the faithful GET
// handler and the autonomous-buyer POST below.
async function fulfillX402(svc: Service, payTo: Address, req: PaymentRequirements, header: string) {
  const v = await verify(header, req);
  if (!v.ok || !v.txHash) return { ok: false as const, reason: v.reason ?? "invalid payment" };
  const provider = BigInt(svc.providerAgentId);
  const now = nowSec();
  source.recordPaidJob(provider, now);
  const { result, txHash } = await commitScore(provider, source.getInputs(provider, now));
  store.add({
    type: "PaidJob",
    agentId: String(svc.providerAgentId),
    blockNumber: "0",
    txHash: v.txHash,
    data: { service: svc.id, payTo, amount: req.maxAmountRequired, commitTx: txHash },
  });
  return {
    ok: true as const,
    settlementTx: v.txHash,
    payload: signalPayload(now),
    reputation: { score: result.score, commitTx: txHash },
  };
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    chainId: CHAIN_ID,
    signer: account?.address ?? null,
    dataSource: source.kind,
    explainer: glmEnabled() ? "glm" : "template",
    byreal: byrealAvailable(),
  })
);

// Live Byreal CLMM (Solana) market context via the Byreal Skills CLI — read-only, no creds.
// Honest framing: signal context the agent reads; reputation/credit run on Mantle.
app.get("/byreal/market", async (c) => {
  const market = await getByrealMarket(nowSec());
  return c.json(market ? { available: true, ...market } : { available: false });
});

// ── verified on-chain Mantle trading record ──────────────────────────────────────────────────
// A real trader's DEX swaps on Mantle mainnet, reconstructed into realized PnL — proof the engine
// ingests real on-chain Mantle activity (not just simulated). Cached; mainnet explorer for links.
let onchainCache: { at: number; rec: OnchainRecord | null } | null = null;
async function onchainRecord(now: number): Promise<OnchainRecord | null> {
  if (!onchainCache || now - onchainCache.at > 120) {
    const rec = await buildOnchainRecord(MANTLE_TRADER_ADDRESS, now).catch(() => null);
    onchainCache = { at: now, rec };
  }
  return onchainCache.rec;
}

app.get("/onchain", async (c) => {
  const now = nowSec();
  const rec = await onchainRecord(now);
  if (!rec) return c.json({ available: false });
  const score = computeScore(rec.scoreInputs);
  return c.json(
    jsonSafe({
      available: true,
      address: rec.address,
      explorer: MANTLE_MAINNET_EXPLORER,
      venue: rec.venue,
      fetchedAt: rec.fetchedAt,
      summary: rec.summary,
      trades: rec.trades.slice(0, 12),
      score: { score: score.score, tier: score.tier, tierName: tierMeta(score.score).name },
    })
  );
});

// Close the loop: commit the on-chain-derived score to the Sepolia oracle for an agent.
app.post("/onchain/commit/:id", async (c) => {
  const id = BigInt(c.req.param("id"));
  const now = nowSec();
  const rec = await onchainRecord(now);
  if (!rec) return c.json({ error: "on-chain record unavailable" }, 503);
  const prev = computeScore(rec.scoreInputs);
  const { result, txHash } = await commitScore(id, rec.scoreInputs);
  return c.json(
    jsonSafe({
      ...result,
      txHash,
      explanation: await explain(prev, result),
      onchain: { address: rec.address, summary: rec.summary },
    })
  );
});

app.get("/deployment", (c) => c.json(addresses));

// Reputation registry / leaderboard (cached background scan).
app.get("/agents", (c) => c.json(getRegistry()));

// Lender-side ERC-4626 vault stats.
app.get("/vault", async (c) => {
  const totalAssets = await vault.read.totalAssets();
  const totalBorrowed = await vault.read.totalBorrowed();
  const available = await vault.read.availableLiquidity();
  const utilizationBps = totalAssets > 0n ? Number((totalBorrowed * 10_000n) / totalAssets) : 0;
  return c.json(jsonSafe({ asset: addresses.MockUSDC, totalAssets, totalBorrowed, available, utilizationBps }));
});

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
  return c.json(jsonSafe({ ...result, txHash, explanation: await explain(undefined, result) }));
});

// The agent's trading track record — the visible source of its reputation.
app.get("/agents/:id/track", (c) => {
  const id = BigInt(c.req.param("id"));
  return c.json(jsonSafe(source.getTrack(id, nowSec())));
});

// Run a trading session: the agent executes new trades, then the score recomputes + commits.
app.post("/agents/:id/earn", async (c) => {
  const id = BigInt(c.req.param("id"));
  const now = nowSec();
  const prev = computeScore(source.getInputs(id, now));
  const trades = source.earn(id, now);
  const { result, txHash } = await commitScore(id, source.getInputs(id, nowSec()));
  const realized = trades.reduce((a, t) => a + t.pnl, 0);
  return c.json(
    jsonSafe({
      prevScore: prev.score,
      ...result,
      txHash,
      explanation: await explain(prev, result),
      session: { trades, realized },
    })
  );
});

// Operator onboarding: attest a starter reputation for a freshly-launched agent. The agentId is
// derived deterministically from the owner wallet, and the score is committed by the engine (the
// oracle signer) — you can't self-assign reputation. The wallet then signs the account + credit
// line. Starter is credible-but-not-elite (T2); it climbs as the agent runs trading sessions.
app.post("/onboard", async (c) => {
  const body = (await c.req.json()) as { owner: string };
  let owner: Address;
  try {
    owner = getAddress((body.owner ?? "").toLowerCase()); // normalize to checksum; throws if invalid
  } catch {
    return c.json({ error: "invalid owner address" }, 400);
  }
  const agentId = 100_000n + (BigInt(owner) % 900_000n);
  const score = 700;
  const evidenceHash = keccak256(encodePacked(["address", "string"], [owner, "swing-onboard-v1"]));
  const txHash = await commitRaw(agentId, score, evidenceHash);
  const meta = tierMeta(score);
  return c.json(
    jsonSafe({
      agentId: agentId.toString(),
      owner,
      score,
      tier: tierOf(score),
      tierName: meta.name,
      evidenceHash,
      txHash,
    })
  );
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

// Live spend: submit a REAL transfer through the agent's GuardedAccount. An allowlisted,
// in-bounds spend executes; a rogue or oversized one mines as a reverted tx (status 0). The
// returned txHash is the on-chain proof — the signature beat, generated on demand.
app.post("/spend", async (c) => {
  const body = (await c.req.json()) as { account: Address; to: Address; amountUsd: number };
  const amount = BigInt(Math.round(body.amountUsd * 1e6));
  const outcome = await executeSpend({
    accountAddr: body.account,
    to: body.to,
    amount,
    ensureFunds: true,
  });
  const code = outcome.reason as SpendReason;
  return c.json(
    jsonSafe({
      ...outcome,
      ok: outcome.status === "success",
      label: SPEND_REASON_LABEL[code],
      amountUsd: body.amountUsd,
    })
  );
});

// ── x402: agents pay each other for services ─────────────────────────────────────────────────

app.get("/x402/services", (c) => c.json(Object.values(SERVICES)));

// Faithful x402 resource: 402 + payment requirements until a valid X-PAYMENT proof arrives.
app.get("/x402/:service", async (c) => {
  const svc = SERVICES[c.req.param("service")];
  if (!svc) return c.json({ error: "unknown service" }, 404);
  const line = await manager.read.getLine([BigInt(svc.providerAgentId)]);
  const payTo = line.account as Address;
  const req = requirements(svc, payTo, `/x402/${svc.id}`);

  const header = c.req.header("X-PAYMENT");
  if (!header) {
    return c.json({ x402Version: X402_VERSION, accepts: [req], error: "payment required" }, 402);
  }
  const out = await fulfillX402(svc, payTo, req, header);
  if (!out.ok) {
    return c.json({ x402Version: X402_VERSION, accepts: [req], error: out.reason }, 402);
  }
  c.header(
    "X-PAYMENT-RESPONSE",
    encodeSettlement({ txHash: out.settlementTx, payTo, amount: req.maxAmountRequired })
  );
  return c.json(
    jsonSafe({
      service: svc.id,
      payload: out.payload,
      settlementTx: out.settlementTx,
      reputation: out.reputation,
    })
  );
});

// Autonomous buyer: run the whole x402 flow (quote → settle on Mantle → redeem → reputation
// loop) in one call, so the dashboard can show the full round-trip with live tx links.
app.post("/x402/:service/buy", async (c) => {
  const svc = SERVICES[c.req.param("service")];
  if (!svc) return c.json({ error: "unknown service" }, 404);
  const provider = BigInt(svc.providerAgentId);
  const line = await manager.read.getLine([provider]);
  const payTo = line.account as Address;
  const req = requirements(svc, payTo, `/x402/${svc.id}`);

  const prevScore = computeScore(source.getInputs(provider, nowSec())).score;
  const settled = await settle(payTo, BigInt(req.maxAmountRequired));
  const out = await fulfillX402(svc, payTo, req, encodeToken({ txHash: settled.txHash }));
  if (!out.ok) return c.json({ error: out.reason }, 502);

  return c.json(
    jsonSafe({
      quote: req,
      settlement: settled,
      payload: out.payload,
      prevScore,
      reputation: out.reputation,
    })
  );
});
