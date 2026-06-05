"use client";

import { tierMeta } from "@swing/shared";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { CreditPanel } from "@/components/CreditPanel";
import { ReputationGauge } from "@/components/ReputationGauge";
import { SpendingControls } from "@/components/SpendingControls";
import { Card, Dot, ExplorerLink, Label } from "@/components/ui";
import { api, type AgentState, type ScoreResult, type SwingEvent } from "@/lib/api";
import { CHAIN_NAME, DEFAULT_AGENT_ID, EXPLORER } from "@/lib/config";
import { ago, shortHash } from "@/lib/format";

const AGENT_ID = DEFAULT_AGENT_ID;

export default function Home() {
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [deployment, setDeployment] = useState<Record<string, string | number> | null>(null);
  const [events, setEvents] = useState<SwingEvent[]>([]);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [earning, setEarning] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([api.agent(AGENT_ID), api.events().catch(() => [])]);
      setAgent(a);
      setEvents(e);
      setEngineUp(true);
    } catch {
      setEngineUp(false);
    }
  }, []);

  useEffect(() => {
    api.deployment().then(setDeployment).catch(() => {});
    refresh();
    const id = setInterval(() => {
      if (!busy.current) refresh();
    }, 7000);
    return () => clearInterval(id);
  }, [refresh]);

  const earn = useCallback(async () => {
    if (earning) return;
    busy.current = true;
    setEarning(true);
    try {
      const r = await api.earn(AGENT_ID);
      setResult(r);
      // optimistic: reflect the freshly-committed score immediately (RPC reads can lag)
      setAgent((prev) =>
        prev
          ? {
              ...prev,
              reputation: {
                ...prev.reputation,
                score: r.score,
                tier: r.tier,
                tierName: tierMeta(r.score).name,
                epoch: prev.reputation.epoch + 1,
                evidenceHash: r.evidenceHash,
                updatedAt: String(Math.floor(Date.now() / 1000)),
              },
            }
          : prev
      );
      setTimeout(() => {
        busy.current = false;
        refresh();
      }, 4000);
    } catch {
      busy.current = false;
    } finally {
      setEarning(false);
    }
  }, [earning, refresh]);

  const rep = agent?.reputation;
  const usdc = deployment?.MockUSDC as string | undefined;

  return (
    <div className="min-h-screen">
      {/* nav */}
      <header className="sticky top-0 z-20 border-b hairline bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="relative grid h-7 w-7 place-items-center rounded-[9px] bg-gradient-to-br from-accent to-accent-2 shadow-[0_0_22px_-6px_var(--color-accent)]">
              <span className="h-2.5 w-2.5 rotate-45 rounded-[3px] bg-[#06251a]" />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight text-ink">the swing</span>
            <span className="hidden text-xs text-faint sm:inline">
              reputation-gated credit for autonomous agents
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 rounded-full border hairline bg-card px-3 py-1.5 text-xs text-ink sm:inline-flex">
              <Dot color={engineUp ? "var(--color-accent)" : "var(--color-danger)"} pulse={!!engineUp} />
              {CHAIN_NAME}
            </span>
            <a
              href={EXPLORER}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-faint hover:text-ink"
            >
              explorer <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {engineUp === false && <EngineBanner />}

        {/* protocol stat strip */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-4">
          {[
            { k: "Vault liquidity", v: "$100K" },
            { k: "Network", v: "Mantle Sepolia" },
            { k: "Contracts live", v: "7" },
            { k: "Rogue txs reverted", v: "1" },
          ].map((s) => (
            <div key={s.k} className="bg-card px-5 py-4">
              <div className="label">{s.k}</div>
              <div className="mt-1.5 font-display text-lg text-ink tnum">{s.v}</div>
            </div>
          ))}
        </section>

        {/* hero: identity + gauge + earn */}
        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="p-8 lg:col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-3xl text-ink">Agent #{AGENT_ID}</h1>
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                    ERC-8004
                  </span>
                </div>
                {agent && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-faint">
                    <span>smart account</span>
                    <ExplorerLink hash={agent.line.account} />
                  </div>
                )}
              </div>
              <div className="text-right text-xs text-faint">
                <div>epoch {rep?.epoch ?? 0}</div>
                <div className="tnum">updated {ago(rep?.updatedAt ?? 0)}</div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-8 lg:flex-row lg:items-center">
              <ReputationGauge
                score={rep?.score ?? 0}
                tier={rep?.tier ?? 0}
                tierName={rep?.tierName ?? "Unproven"}
              />

              <div className="flex-1 space-y-4">
                <div>
                  <span className="pill">Reputation engine</span>
                  <p className="mt-3 min-h-[44px] text-sm leading-relaxed text-ink/80">
                    {result?.explanation ??
                      "Score is recomputed from the agent's recency-decayed, Sybil-gated track record and committed on-chain. Post fresh trades to recompute."}
                  </p>
                </div>

                <button
                  onClick={earn}
                  disabled={earning || engineUp === false}
                  className="ring-ink group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-5 py-3 text-sm font-semibold text-[#06251a] shadow-[0_10px_34px_-10px_var(--color-accent)] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {earning ? (
                    <>
                      <Sparkles className="h-4 w-4 animate-pulse" /> committing on-chain…
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4" /> Post new trades → recompute
                    </>
                  )}
                </button>

                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="flex items-center justify-between rounded-xl border hairline bg-paper-2/40 px-3 py-2 text-xs"
                    >
                      <span className="text-faint">
                        {result.prevScore != null && (
                          <span className="tnum">
                            {result.prevScore} → {result.score}
                          </span>
                        )}{" "}
                        committed
                      </span>
                      <ExplorerLink hash={result.txHash} kind="tx" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {rep && (
              <div className="mt-6 flex items-center gap-2 border-t hairline pt-4 text-xs text-faint">
                <Zap className="h-3 w-3" />
                evidence <span className="mono">{shortHash(rep.evidenceHash)}</span>
                <span className="text-faint/60">— recomputable; binds the commit to its inputs</span>
              </div>
            )}
          </Card>

          <div className="lg:col-span-2">{agent && <CreditPanel line={agent.line} />}</div>
        </section>

        {/* safety + activity */}
        <section className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {agent && (
              <SpendingControls account={agent.line.account} usdcAddress={usdc} tier={agent.line.tier} />
            )}
          </div>
          <div className="lg:col-span-2">
            <ActivityFeed events={events} />
          </div>
        </section>

        <footer className="flex flex-col items-center gap-1 pt-4 pb-10 text-center text-xs text-faint">
          <div>
            earn → reputation → credit → deploy → <span className="text-danger">rogue-reject</span> · every step a
            verifiable Mantle event
          </div>
          <div>Turing Test Hackathon 2026 · Mantle × Bybit × Byreal × BGA</div>
        </footer>
      </main>
    </div>
  );
}

function EngineBanner() {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft px-5 py-4 text-sm text-ink">
      <span className="font-medium text-danger">Engine not reachable.</span> Start it with{" "}
      <code className="mono rounded bg-card px-1.5 py-0.5 text-xs">
        ENGINE_PORT=8799 pnpm --filter @swing/engine start
      </code>
    </div>
  );
}
