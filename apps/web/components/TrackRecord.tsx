"use client";

import { LineChart } from "lucide-react";
import type { TrackRecord as Track } from "@/lib/api";
import { ago } from "@/lib/format";
import { Card, Label } from "./ui";

const signedUsd = (n: number) =>
  `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n)).toLocaleString()}`;

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const W = 120;
  const H = 40;
  const min = Math.min(0, ...data);
  const max = Math.max(...data, 1);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-full">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrackRecord({ track }: { track: Track | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b hairline px-6 py-4">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-faint" />
          <h2 className="font-display text-xl text-ink">Trading record</h2>
        </div>
        <span className="rounded-full border hairline px-2.5 py-1 text-[11px] text-muted">
          {track?.venue ?? "Byreal · RealClaw"} · Mantle
        </span>
      </div>

      {!track ? (
        <div className="px-6 py-14 text-center text-sm text-faint">Loading track record…</div>
      ) : (
        <div className="p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Label>Realized PnL</Label>
              <div
                className={`mt-1 font-display text-3xl tnum ${
                  track.summary.realizedPnl >= 0 ? "text-ink" : "text-danger"
                }`}
              >
                {signedUsd(track.summary.realizedPnl)}
              </div>
            </div>
            <div className="w-40 shrink-0">
              <Sparkline data={track.summary.equity} />
              <div className="mt-1 text-right text-[11px] text-faint">equity curve</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4 border-t hairline pt-4">
            <Metric label="Win rate" value={`${Math.round(track.summary.winRate * 100)}%`} />
            <Metric label="Trades" value={String(track.summary.count)} />
            <Metric label="Max drawdown" value={`${Math.round(track.summary.maxDrawdown * 100)}%`} />
          </div>

          <Label className="mt-6 block">Recent trades</Label>
          <div className="mt-1 divide-y hairline">
            {track.trades.slice(0, 6).map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2 text-faint">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      t.win ? "bg-ink" : "bg-danger"
                    }`}
                  />
                  <span className="text-muted">{t.win ? "Position closed" : "Loss"}</span>
                  <span className="tnum text-faint">· {ago(t.timestamp)}</span>
                </span>
                <span className={`tnum font-medium ${t.win ? "text-ink" : "text-danger"}`}>
                  {signedUsd(t.pnl)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="leading-tight min-h-[2.6em] sm:min-h-0">{label}</Label>
      <div className="mt-1 tnum text-base text-ink">{value}</div>
    </div>
  );
}
