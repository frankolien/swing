"use client";

import { creditLimitUsd, tierMeta } from "@swing/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { OnchainPanel } from "@/components/OnchainPanel";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { TIER_STYLE } from "@/components/tiers";
import { Card, ExplorerLink } from "@/components/ui";
import { api, type AgentSummary } from "@/lib/api";
import { isZero, usd } from "@/lib/format";

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [engineUp, setEngineUp] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .agents()
        .then((a) => {
          setAgents([...a].sort((x, y) => y.reputation.score - x.reputation.score));
          setEngineUp(true);
        })
        .catch(() => setEngineUp(false));
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader engineUp={engineUp} />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-4xl text-ink">Agent registry</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Reputation is portable, on-chain, and Sybil-gated. Higher trust unlocks larger,
              less-collateralized credit. Brightness = tier.
            </p>
          </div>
          <span className="label hidden sm:block">{agents?.length ?? "—"} agents · ERC-8004</span>
        </div>

        <Card className="mt-8 overflow-hidden">
          <div className="hidden grid-cols-12 gap-4 border-b hairline px-6 py-3 text-[11px] uppercase tracking-wider text-faint sm:grid">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Agent</div>
            <div className="col-span-4">Reputation</div>
            <div className="col-span-2">Tier</div>
            <div className="col-span-2 text-right">Credit unlocked</div>
          </div>

          {!agents && <div className="px-6 py-12 text-center text-sm text-faint">Loading registry…</div>}
          {agents?.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-faint">No agents scored yet.</div>
          )}

          <div className="divide-y hairline">
            {agents?.map((a, i) => {
              const s = a.reputation.score;
              const tier = a.reputation.tier;
              const style = TIER_STYLE[Math.min(3, tier)]!;
              const credit = creditLimitUsd(s);
              const active = !isZero(a.line.account);
              return (
                <Link
                  key={a.agentId}
                  href={`/console?agent=${a.agentId}`}
                  className="group grid grid-cols-2 items-center gap-4 px-6 py-4 transition-colors hover:bg-card-2/50 sm:grid-cols-12"
                >
                  <div className="hidden font-mono text-sm text-faint sm:col-span-1 sm:block">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="sm:col-span-3">
                    <div className="font-display text-base text-ink">Agent #{a.agentId}</div>
                    <div className="mt-0.5 hidden text-xs text-faint sm:block">
                      {active ? "line active" : "eligible"}
                    </div>
                  </div>
                  <div className="hidden sm:col-span-4 sm:block">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(s / 1000) * 100}%`, background: style.hex }}
                        />
                      </div>
                      <span className="tnum w-10 text-right text-sm text-ink">{s}</span>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${style.soft} ${style.ring} ${style.text}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.hex }} />
                      T{tier} · {tierMeta(s).name}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2 sm:col-span-2">
                    <span className="tnum text-sm text-ink">{usd(credit * 1e6, true)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-faint transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* Real-world benchmark: a live Mantle wallet scored by the same engine. */}
        <section className="mt-14 space-y-4 border-t hairline pt-10">
          <div className="space-y-1">
            <span className="label">Real-world benchmark · live on-chain</span>
            <p className="max-w-2xl text-sm text-muted">
              The agents above run on simulated sessions. To prove the same engine scores genuine
              activity, it reads a real, live Mantle trader straight from chain — realized PnL
              reconstructed from public DEX swaps, then scored on the very same curve.
            </p>
          </div>
          <OnchainPanel />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
