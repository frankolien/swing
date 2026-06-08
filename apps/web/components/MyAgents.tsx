"use client";

import { creditLimitUsd, tierMeta } from "@swing/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { api, type AgentState } from "@/lib/api";
import { isZero, usd } from "@/lib/format";
import { getMyAgents } from "@/lib/myAgents";
import { TIER_STYLE } from "./tiers";
import { Card, Label } from "./ui";

/// "Agents you launched from this wallet" — reads ids remembered in localStorage and hydrates each
/// from chain by id (the engine's /agents list only scans ids 1–8, so onboarded agents never appear
/// there). Returns null when disconnected or none remembered.
export function MyAgents() {
  const { address, isConnected } = useAccount();
  const [agents, setAgents] = useState<AgentState[] | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setAgents(null);
      return;
    }
    const ids = getMyAgents(address).map((a) => a.id);
    if (!ids.length) {
      setAgents([]);
      return;
    }
    let alive = true;
    Promise.all(ids.map((id) => api.agent(id).catch(() => null))).then((rows) => {
      if (alive) setAgents(rows.filter(Boolean) as AgentState[]);
    });
    return () => {
      alive = false;
    };
  }, [address, isConnected]);

  if (!isConnected || !agents || agents.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Your agents</Label>
        <span className="text-[11px] text-faint">launched from this wallet</span>
      </div>
      <Card className="overflow-hidden">
        <div className="divide-y hairline">
          {agents.map((a) => {
            const s = a.reputation.score;
            const tier = a.reputation.tier;
            const style = TIER_STYLE[Math.min(3, tier)]!;
            const active = !isZero(a.line.account);
            return (
              <Link
                key={a.agentId}
                href={`/console?agent=${a.agentId}`}
                className="group grid grid-cols-2 items-center gap-4 px-6 py-4 transition-colors hover:bg-card-2/50 sm:grid-cols-12"
              >
                <div className="sm:col-span-4">
                  <div className="font-display text-base text-ink">Agent #{a.agentId}</div>
                  <div className="mt-0.5 text-xs text-faint">{active ? "line active" : "eligible"}</div>
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
                <div className="hidden sm:col-span-2 sm:block">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${style.soft} ${style.ring} ${style.text}`}
                  >
                    T{tier} · {tierMeta(s).name}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 sm:col-span-2">
                  <span className="tnum text-sm text-ink">{usd(creditLimitUsd(s) * 1e6, true)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-faint transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
