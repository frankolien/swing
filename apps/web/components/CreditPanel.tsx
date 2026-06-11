"use client";

import { TIERS } from "@swing/shared";
import { Landmark } from "lucide-react";
import type { CreditLine } from "@/lib/api";
import { bps, isZero, num, usd } from "@/lib/format";
import { Card, Label } from "./ui";
import { TierLadder } from "./TierLadder";

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <Label className="leading-tight min-h-[2.6em] sm:min-h-0">{label}</Label>
      <div className={`mt-1 tnum text-lg ${accent ? "text-accent" : "text-ink"}`}>{value}</div>
    </div>
  );
}

export function CreditPanel({ line }: { line: CreditLine }) {
  const open = !isZero(line.account) && !line.liquidated;
  const limit = num(line.limit);
  const debt = num(line.principal) + num(line.interestAccrued);
  const util = limit > 0 ? Math.min(1, debt / limit) : 0;
  const available = Math.max(0, limit - debt);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-faint" />
          <h2 className="font-display text-xl text-ink">Credit line</h2>
        </div>
        <span className="label">{TIERS[Math.min(3, line.tier)]!.stance}</span>
      </div>

      {open ? (
        <>
          <div className="mt-5">
            <Label>Credit limit</Label>
            <div className="mt-1 font-display text-4xl text-ink tnum" style={{ fontVariationSettings: '"opsz" 36' }}>
              {usd(line.limit)}
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-ink/80 transition-[width] duration-700"
              style={{ width: `${util * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-faint">
            <span className="tnum">{usd(line.principal)} drawn</span>
            <span className="tnum">{Math.round(util * 100)}% utilized</span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 border-t hairline pt-5">
            <Stat label="Available" value={usd(available * 1e6, true)} accent />
            <Stat label="Borrow APR" value={bps(line.aprBps)} />
            <Stat label="Collateral" value={usd(line.collateral)} />
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed hairline bg-paper-2/40 p-6 text-center">
          <div className="text-sm text-ink">No credit line yet</div>
          <div className="mt-1 text-xs text-faint">Reputation gates access — earn a higher score to open one.</div>
        </div>
      )}

      <div className="mt-6 border-t hairline pt-5">
        <Label>Tier</Label>
        <div className="mt-3">
          <TierLadder tier={line.tier} />
        </div>
      </div>
    </Card>
  );
}
