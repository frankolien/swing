"use client";

import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Boxes,
  Coins,
  Gauge,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Card } from "@/components/ui";
import { api, type VaultStats } from "@/lib/api";
import { usd } from "@/lib/format";

const STEPS = [
  { n: "01", t: "Trade", d: "An agent builds a track record trading on Byreal / RealClaw." },
  { n: "02", t: "Score", d: "The engine commits a recency-decayed, Sybil-gated reputation on-chain." },
  { n: "03", t: "Borrow", d: "Its tier opens an under-collateralized credit line from the vault." },
  { n: "04", t: "Deploy", d: "Capital lands in a spending-guarded smart account." },
  { n: "05", t: "Guard", d: "Allowed spends execute. Rogue spends revert on-chain." },
];

const PIECES = [
  { icon: BadgeCheck, t: "Identity", d: "Every agent is an ERC-8004 NFT; reputation is portable and transfer-aware." },
  { icon: Gauge, t: "Reputation", d: "R ∈ [0,1000] from real PnL + signals, committed with an auditable evidence hash." },
  { icon: Banknote, t: "Credit", d: "An ERC-4626 lender pool; a CreditManager opens reputation-tiered lines." },
  { icon: ShieldCheck, t: "Safety", d: "An ERC-7579 spending guard reverts rogue transactions in the tx itself." },
  { icon: Receipt, t: "Payments", d: "Agents pay each other over x402; proof-of-payment enriches reputation." },
];

export default function Landing() {
  const [vault, setVault] = useState<VaultStats | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);

  useEffect(() => {
    api.vault().then(setVault).catch(() => {});
    api.agents().then((a) => setAgentCount(a.length)).catch(() => {});
  }, []);

  const stats = [
    { k: "Vault liquidity", v: vault ? usd(vault.totalAssets, true) : "$100K" },
    { k: "Agents scored", v: String(agentCount ?? 6) },
    { k: "Credit deployed", v: vault ? usd(vault.totalBorrowed, true) : "$5K" },
    { k: "Rogue txs reverted", v: "1" },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6">
        {/* hero */}
        <section className="pt-20 pb-16 sm:pt-28">
          <div className="inline-flex items-center gap-2 rounded-full border hairline bg-card px-3 py-1.5 text-[11px] tracking-wide text-muted">
            <Boxes className="h-3.5 w-3.5" /> On Mantle · ERC-8004 · ERC-7579 · x402
          </div>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-7xl">
            Agents earn trust.
            <br />
            Capital follows.
            <br />
            Rogue spends <span className="text-danger">revert.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            the swing is an on-chain economic layer for autonomous AI agents. A portable reputation
            gates a tiered credit line; a spending guard reverts rogue transactions on-chain; agents
            settle with each other over x402. Every decision is a verifiable Mantle event.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/console"
              className="group inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-paper transition-all hover:bg-ink/90"
            >
              Open the console
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/agents"
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-card"
            >
              Browse agents
            </Link>
          </div>
        </section>

        {/* live stats */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.k} className="bg-card px-6 py-5">
              <div className="label">{s.k}</div>
              <div className="mt-2 font-display text-2xl text-ink tnum">{s.v}</div>
            </div>
          ))}
        </section>

        {/* how it works */}
        <section className="py-20">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl text-ink">How it works</h2>
            <span className="label">the loop</span>
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border hairline bg-line sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-card p-6">
                <div className="font-mono text-xs text-faint">{s.n}</div>
                <div className="mt-3 font-display text-lg text-ink">{s.t}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* the pieces */}
        <section className="pb-20">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl text-ink">The pieces</h2>
            <span className="label">composable on Mantle</span>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PIECES.map((p) => (
              <Card key={p.t} className="p-6 transition-colors hover:border-line-strong">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-line-strong text-ink">
                  <p.icon className="h-4 w-4" />
                </div>
                <div className="mt-4 font-display text-lg text-ink">{p.t}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.d}</p>
              </Card>
            ))}
            <Card className="flex flex-col justify-between bg-paper-2/40 p-6">
              <Coins className="h-5 w-5 text-faint" />
              <div>
                <div className="font-display text-lg text-ink">See it live</div>
                <Link href="/console" className="mt-1.5 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
                  Open the console <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
