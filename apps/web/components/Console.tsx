"use client";

import { tierMeta } from "@swing/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, TrendingUp, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ByrealMarketStrip } from "@/components/ByrealMarketStrip";
import { CreditPanel } from "@/components/CreditPanel";
import { ReputationGauge } from "@/components/ReputationGauge";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SpendingControls } from "@/components/SpendingControls";
import { TrackRecord } from "@/components/TrackRecord";
import { X402Panel } from "@/components/X402Panel";
import { Card, ExplorerLink } from "@/components/ui";
import {
  api,
  type AgentState,
  type ScoreResult,
  type SwingEvent,
  type TrackRecord as TrackData,
} from "@/lib/api";
import { DEFAULT_AGENT_ID } from "@/lib/config";
import { ago, shortHash } from "@/lib/format";

export function Console() {
  const agentId = useSearchParams().get("agent") ?? DEFAULT_AGENT_ID;

  const [agent, setAgent] = useState<AgentState | null>(null);
  const [track, setTrack] = useState<TrackData | null>(null);
  const [deployment, setDeployment] = useState<Record<string, string | number> | null>(null);
  const [events, setEvents] = useState<SwingEvent[]>([]);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [earning, setEarning] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [a, e, t] = await Promise.all([
        api.agent(agentId),
        api.events().catch(() => []),
        api.track(agentId).catch(() => null),
      ]);
      setAgent(a);
      setEvents(e);
      if (t) setTrack(t);
      setEngineUp(true);
    } catch {
      setEngineUp(false);
    }
  }, [agentId]);

  useEffect(() => {
    setAgent(null);
    setTrack(null);
    setResult(null);
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
      const r = await api.earn(agentId);
      setResult(r);
      api.track(agentId).then((t) => t && setTrack(t)).catch(() => {});
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
  }, [agentId, earning, refresh]);

  const rep = agent?.reputation;
  const usdc = deployment?.MockUSDC as string | undefined;

  return (
    <div className="min-h-screen">
      <SiteHeader engineUp={engineUp} />

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {engineUp === false && <EngineBanner />}

        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="p-8 lg:col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-3xl text-ink">Agent #{agentId}</h1>
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                    ERC-8004
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  Autonomous trader · Byreal / RealClaw on Mantle
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
                  <p className="mt-3 min-h-[60px] text-sm leading-relaxed text-ink/80">
                    {result?.explanation ??
                      "This agent trades autonomously on Mantle. Its realized-PnL track record — recency-decayed and Sybil-gated — sets the score above, which gates its credit. Run a session to watch trades land and the score move."}
                  </p>
                </div>

                <div>
                  <button
                    onClick={earn}
                    disabled={earning || engineUp === false}
                    className="ring-ink group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-paper transition-all hover:bg-ink/90 disabled:opacity-50"
                  >
                    {earning ? (
                      <>
                        <Sparkles className="h-4 w-4 animate-pulse" /> trading + committing on-chain…
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4" /> Run a trading session
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-faint">
                    agent executes trades → engine recomputes → commits on-chain
                  </p>
                </div>

                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="flex items-center justify-between rounded-xl border hairline bg-paper-2/40 px-3 py-2 text-xs"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 text-faint">
                        {result.session && (
                          <span>
                            {result.session.trades.length} trades{" "}
                            <span className="tnum text-ink">
                              {result.session.realized >= 0 ? "+" : "−"}$
                              {Math.abs(result.session.realized).toLocaleString()}
                            </span>{" "}
                            ·
                          </span>
                        )}
                        {result.prevScore != null && (
                          <span className="tnum">
                            R {result.prevScore} → {result.score}
                          </span>
                        )}
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

        {/* live market context (real Byreal Skills CLI data) */}
        <section>
          <ByrealMarketStrip />
        </section>

        {/* trading record + activity */}
        <section className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <TrackRecord track={track} />
          </div>
          <div className="lg:col-span-2">
            <ActivityFeed events={events} />
          </div>
        </section>

        {/* agent-to-agent payments */}
        <section>
          <X402Panel />
        </section>

        {/* spending controls */}
        <section>
          {agent && (
            <SpendingControls account={agent.line.account} usdcAddress={usdc} tier={agent.line.tier} />
          )}
        </section>
      </main>

      <SiteFooter />
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
