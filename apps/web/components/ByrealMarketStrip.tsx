"use client";

import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type ByrealMarket } from "@/lib/api";
import { Card } from "./ui";

const compactUsd = (n?: number) => {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
};

export function ByrealMarketStrip() {
  const [m, setM] = useState<ByrealMarket | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .byrealMarket()
        .then((d) => alive && setM(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!m?.available) return null;

  return (
    <Card className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <div>
          <div className="flex items-center gap-1.5 text-sm text-ink">
            <Activity className="h-3.5 w-3.5 text-faint" />
            Live market · <span className="font-medium">Byreal</span> CLMM
          </div>
          <div className="text-[11px] leading-relaxed text-faint">
            Solana · via Byreal Skills CLI{m.version ? ` v${m.version}` : ""} — signal context the
            agent reads; credit &amp; safety run on Mantle
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
        <Stat label="TVL" value={compactUsd(m.tvlUsd)} change={m.tvlChange24h} />
        <Stat label="24h volume" value={compactUsd(m.volume24hUsd)} change={m.volumeChange24h} />
        <Stat label="24h fees" value={compactUsd(m.fee24hUsd)} />
        <Stat label="Pools" value={String(m.poolsCount ?? "—")} />
      </div>
    </Card>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change?: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tnum text-sm text-ink">{value}</span>
        {change != null && (
          <span className={`tnum text-[10px] ${change < 0 ? "text-danger" : "text-faint"}`}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}
