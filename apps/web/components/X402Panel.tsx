"use client";

import { Receipt, Zap } from "lucide-react";
import { type ReactNode, useState } from "react";
import { api, type X402Result } from "@/lib/api";
import { Card, ExplorerLink, Label } from "./ui";

export function X402Panel() {
  const [res, setRes] = useState<X402Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function buy() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      setRes(await api.x402Buy("alpha-signal"));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const priceUsd = res ? Number(res.quote.maxAmountRequired) / 1e6 : 5;
  const delta = res ? res.reputation.score - res.prevScore : 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b hairline px-6 py-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-faint" />
          <h2 className="font-display text-xl text-ink">Agent services · x402</h2>
        </div>
        <span className="rounded-full border hairline px-2.5 py-1 text-[11px] text-muted">
          HTTP 402 · USDC · Mantle
        </span>
      </div>

      <div className="grid gap-0 sm:grid-cols-2">
        {/* the offer */}
        <div className="space-y-4 border-b hairline p-6 sm:border-b-0 sm:border-r">
          <div>
            <Label>Service</Label>
            <div className="mt-1 text-sm font-medium text-ink">Momentum alpha signal</div>
            <p className="mt-1.5 text-xs leading-relaxed text-faint">
              Agent #1 sells its current MNT/USDC read, per call. A buyer agent pays in USDC —
              settlement is a real Mantle transaction, and the proof-of-payment loops back into
              agent #1&apos;s ERC-8004 reputation.
            </p>
          </div>
          <div className="flex items-center gap-8">
            <div>
              <Label>Price</Label>
              <div className="mt-1 tnum text-lg text-ink">
                ${priceUsd.toFixed(0)} <span className="text-xs text-faint">USDC</span>
              </div>
            </div>
            <div>
              <Label>Scheme</Label>
              <div className="mt-1 text-sm text-ink">exact</div>
            </div>
          </div>
          <button
            onClick={buy}
            disabled={busy}
            className="ring-ink inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-paper transition-all hover:bg-ink/90 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Zap className="h-4 w-4 animate-pulse" /> paying over x402…
              </>
            ) : (
              <>
                <Receipt className="h-4 w-4" /> Buy over x402
              </>
            )}
          </button>
        </div>

        {/* the flow */}
        <div className="p-6">
          <Label>402 → pay → 200</Label>
          {!res ? (
            <p className="mt-3 text-sm leading-relaxed text-faint">
              {failed ? (
                <span className="text-danger">Engine unreachable — couldn&apos;t settle.</span>
              ) : (
                <>
                  The buyer agent hits a <span className="text-ink">402</span>, settles $
                  {priceUsd.toFixed(0)} USDC on Mantle, then redeems the signal. Watch agent #1&apos;s
                  reputation tick up from the paid job.
                </>
              )}
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              <Step n="402" label="Payment required" detail={`$${priceUsd.toFixed(0)} USDC → agent #1`} />
              <Step n="pay" label="Settled on Mantle" ok detail={<ExplorerLink hash={res.settlement.txHash} kind="tx" />} />
              <Step
                n="200"
                label="Signal delivered"
                ok
                detail={`${res.payload.pair} · ${res.payload.bias} · ${Math.round(res.payload.confidence * 100)}%`}
              />
              <Step
                n="rep"
                label={delta > 0 ? `Reputation +${delta}` : "Proof-of-payment recorded"}
                ok
                detail={
                  <span className="flex items-center gap-2">
                    <span className="tnum">
                      {delta > 0 ? `${res.prevScore}→${res.reputation.score}` : `R ${res.reputation.score}`}
                    </span>
                    <ExplorerLink hash={res.reputation.commitTx} kind="tx" />
                  </span>
                }
              />
            </div>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            Faithful x402 — 402 with payment requirements, then a buyer retries with an X-PAYMENT
            proof. The mock facilitator verifies the settlement on-chain before delivering.
          </p>
        </div>
      </div>
    </Card>
  );
}

function Step({ n, label, detail, ok }: { n: string; label: string; detail: ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`tnum inline-flex h-6 min-w-[2.75rem] items-center justify-center rounded-full px-2 text-[10px] font-medium ${
          ok ? "bg-accent/10 text-accent" : "bg-paper-2 text-faint"
        }`}
      >
        {n}
      </span>
      <div className="flex flex-1 items-center justify-between gap-2">
        <span className="text-sm text-ink">{label}</span>
        <span className="text-right text-xs text-faint">{detail}</span>
      </div>
    </div>
  );
}
