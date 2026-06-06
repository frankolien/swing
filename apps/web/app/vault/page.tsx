"use client";

import { ArrowDownToLine, Landmark, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { LenderPanel } from "@/components/LenderPanel";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Card, ExplorerLink, Label } from "@/components/ui";
import { api, type VaultStats } from "@/lib/api";
import { usd } from "@/lib/format";

export default function VaultPage() {
  const [vault, setVault] = useState<VaultStats | null>(null);
  const [engineUp, setEngineUp] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .vault()
        .then((v) => {
          setVault(v);
          setEngineUp(true);
        })
        .catch(() => setEngineUp(false));
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const util = vault ? vault.utilizationBps / 100 : 0;

  return (
    <div className="min-h-screen">
      <SiteHeader engineUp={engineUp} />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-faint" />
          <h1 className="font-display text-4xl text-ink">Credit vault</h1>
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted">
          An ERC-4626 lender pool. Depositors earn yield from borrower interest; agents draw
          reputation-tiered, under-collateralized credit. Inflation-attack mitigated.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <Card className="p-8 lg:col-span-3">
            <Label>Total value locked</Label>
            <div className="mt-2 font-display text-6xl text-ink tnum">
              {vault ? usd(vault.totalAssets) : "—"}
            </div>

            <div className="mt-8">
              <div className="flex justify-between text-xs text-faint">
                <span>utilization</span>
                <span className="tnum">{util.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-ink/85 transition-[width] duration-700"
                  style={{ width: `${Math.min(100, util)}%` }}
                />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4 border-t hairline pt-6">
              <Metric label="Deposits" value={vault ? usd(vault.totalAssets, true) : "—"} icon={ArrowDownToLine} />
              <Metric label="Borrowed" value={vault ? usd(vault.totalBorrowed, true) : "—"} icon={TrendingUp} />
              <Metric label="Available" value={vault ? usd(vault.available, true) : "—"} />
            </div>
          </Card>

          <div className="space-y-6 lg:col-span-2">
            <LenderPanel />

            <Card className="p-6">
              <Label>Interest model</Label>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Two-slope utilization curve plus a per-tier reputation spread — lower-tier agents pay
                more. Base 2%, kink at 80%.
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <Row k="Base APR" v="2.00%" />
                <Row k="Kink" v="80% util" />
                <Row k="Tier spread" v="T3 +2% → T0 +20%" />
              </div>
            </Card>

            <Card className="p-6">
              <Label>Vault contract</Label>
              <div className="mt-3 space-y-2 text-sm">
                <Row k="Standard" v="ERC-4626" />
                <Row k="Asset" v="USDC (6dp)" />
                {vault && (
                  <div className="flex items-center justify-between">
                    <span className="text-faint">Address</span>
                    <ExplorerLink hash={vault.asset} />
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 label">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-1.5 tnum text-lg text-ink">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-faint">{k}</span>
      <span className="text-ink">{v}</span>
    </div>
  );
}
