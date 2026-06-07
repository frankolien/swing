"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, BadgeCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type OnchainCommit, type OnchainRecord } from "@/lib/api";
import { Card, Label } from "./ui";

// Isolated oracle slot so committing the on-chain-derived score never clobbers the demo agent.
const ONCHAIN_AGENT_ID = 9;

const signedUsd = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n).toFixed(2)}`;
const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function OnchainPanel() {
  const [rec, setRec] = useState<OnchainRecord | null>(null);
  const [commit, setCommit] = useState<OnchainCommit | null>(null);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .onchain()
      .then((d) => alive && setRec(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!rec?.available || !rec.summary) return null;
  const s = rec.summary;
  const explorer = rec.explorer ?? "https://mantlescan.xyz";
  const txUrl = (h: string) => `${explorer}/tx/${h}`;

  async function doCommit() {
    if (committing) return;
    setCommitting(true);
    try {
      setCommit(await api.onchainCommit(ONCHAIN_AGENT_ID));
    } catch {
      /* ignore */
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-6 py-4">
        <div className="flex items-start gap-2">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl text-ink">Live Mantle trader · verified on-chain</h2>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                live
              </span>
            </div>
            <p className="mt-0.5 max-w-md text-xs text-faint">
              {rec.provenance?.note ??
                "An independent real wallet — the same engine, scoring genuine DEX activity."}
            </p>
          </div>
        </div>
        <a
          href={`${explorer}/address/${rec.address}`}
          target="_blank"
          rel="noreferrer"
          className="mono inline-flex items-center gap-1 text-xs text-faint transition-colors hover:text-ink"
        >
          {shortAddr(rec.address ?? "")} <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      <div className="grid gap-0 lg:grid-cols-5">
        {/* summary + commit */}
        <div className="space-y-5 border-b hairline p-6 lg:col-span-2 lg:border-b-0 lg:border-r">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Label>Realized PnL</Label>
              <div
                className={`mt-1 font-display text-3xl tnum ${
                  s.realizedPnl >= 0 ? "text-ink" : "text-danger"
                }`}
              >
                {signedUsd(s.realizedPnl)}
              </div>
            </div>
            <div className="text-right">
              <Label>Engine score</Label>
              <div className="mt-1 tnum text-2xl text-ink">{rec.score?.score ?? "—"}</div>
              <div className="text-[11px] text-faint">{rec.score?.tierName}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t hairline pt-4 text-center">
            <Metric label="Win rate" value={`${Math.round(s.winRate * 100)}%`} />
            <Metric label="Closed" value={String(s.closedTrades)} />
            <Metric label="Swaps" value={String(s.swaps)} />
          </div>

          <button
            onClick={doCommit}
            disabled={committing}
            className="ring-ink inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-paper transition-all hover:bg-ink/90 disabled:opacity-50"
          >
            {committing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> committing to Mantle…
              </>
            ) : (
              <>
                <BadgeCheck className="h-4 w-4" /> Commit this record → reputation
              </>
            )}
          </button>
          <AnimatePresence>
            {commit && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-xl border hairline bg-paper-2/40 px-3 py-2 text-xs"
              >
                <span className="tnum text-faint">
                  committed R <span className="text-ink">{commit.score}</span> on Mantle
                </span>
                <a
                  href={`https://sepolia.mantlescan.xyz/tx/${commit.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono inline-flex items-center gap-1 text-accent hover:underline"
                >
                  {shortHash(commit.txHash)} <ArrowUpRight className="h-3 w-3" />
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* real trades */}
        <div className="p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <Label>Recent on-chain trades</Label>
            <span className="text-[11px] text-faint">{rec.venue}</span>
          </div>
          <div className="mt-2 divide-y hairline">
            {(rec.trades ?? []).slice(0, 6).map((t) => (
              <div key={t.hash} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${t.win ? "bg-ink" : "bg-danger"}`} />
                  <span className="text-muted">
                    {t.win ? "Closed" : "Loss"} <span className="text-faint">{t.symbol}</span>
                  </span>
                  <a
                    href={txUrl(t.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="mono inline-flex items-center gap-0.5 text-[11px] text-faint transition-colors hover:text-ink"
                  >
                    {shortHash(t.hash)} <ArrowUpRight className="h-2.5 w-2.5" />
                  </a>
                </span>
                <span className={`tnum font-medium ${t.win ? "text-ink" : "text-danger"}`}>
                  {signedUsd(t.pnl)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            Real DEX swaps by a live Mantle trader (Merchant Moe / Agni), reconstructed from chain
            via the explorer account API — realized PnL from stablecoin legs, each trade a public
            Mantle tx. Proof the engine scores <span className="text-ink">real on-chain activity</span>,
            not just simulation. {s.openPositions} open position{s.openPositions === 1 ? "" : "s"} ·
            {" "}
            {s.spanDays}d span.
          </p>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-0.5 tnum text-base text-ink">{value}</div>
    </div>
  );
}
