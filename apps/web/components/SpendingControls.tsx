"use client";

import { TIERS } from "@swing/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShieldCheck, ShieldX, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { DEMO, txUrl } from "@/lib/config";
import { encodeTransfer } from "@/lib/encode";
import { isZero, usd } from "@/lib/format";
import { Card, ExplorerLink, Label } from "./ui";

type Verdict = { ok: boolean; label: string; amount: number; to: "merchant" | "attacker" } | null;

export function SpendingControls({
  account,
  usdcAddress,
  tier,
}: {
  account: string;
  usdcAddress?: string;
  tier: number;
}) {
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const t = TIERS[Math.min(3, tier)]!;
  const ready = !isZero(account) && !!usdcAddress;

  async function simulate(to: "merchant" | "attacker", amountUsd: number) {
    if (!ready) return;
    const key = `${to}-${amountUsd}`;
    setBusy(key);
    try {
      const data = encodeTransfer(DEMO[to], BigInt(Math.round(amountUsd * 1e6)));
      const res = await api.previewSpend({ account, target: usdcAddress!, value: "0", data });
      setVerdict({ ok: res.reason === 0, label: res.label, amount: amountUsd, to });
    } catch {
      setVerdict({ ok: false, label: "Engine unreachable", amount: amountUsd, to });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b hairline px-6 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <h2 className="font-display text-xl text-ink">Spending controls</h2>
        </div>
        {!isZero(account) && <ExplorerLink hash={account} className="text-xs" />}
      </div>

      <div className="grid gap-0 sm:grid-cols-2">
        {/* policy */}
        <div className="space-y-5 border-b hairline p-6 sm:border-b-0 sm:border-r">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Per-tx cap</Label>
              <div className="mt-1 tnum text-lg text-ink">{usd(t.perTxUsd * 1e6, true)}</div>
            </div>
            <div>
              <Label>Daily limit</Label>
              <div className="mt-1 tnum text-lg text-ink">{usd(t.dailyUsd * 1e6, true)}</div>
            </div>
          </div>
          <div>
            <Label>Allowlist</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                <Check className="h-3 w-3" /> merchant
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-1 text-xs text-faint line-through">
                attacker
              </span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-faint">
            The guard meters every outbound call on-chain. Anything off-allowlist or over a cap
            reverts in the transaction — funds never move.
          </p>
        </div>

        {/* simulator */}
        <div className="p-6">
          <Label>Try a spend</Label>
          <div className="mt-3 grid gap-2">
            <SimButton
              label="Pay merchant"
              sub="$1,000 · allowlisted"
              busy={busy === "merchant-1000"}
              onClick={() => simulate("merchant", 1000)}
            />
            <SimButton
              label="Drain to attacker"
              sub="$1,000 · not allowlisted"
              danger
              busy={busy === "attacker-1000"}
              onClick={() => simulate("attacker", 1000)}
            />
            <SimButton
              label="Oversized payout"
              sub={`$${(t.perTxUsd + 5000).toLocaleString()} · over per-tx cap`}
              danger
              busy={busy === `merchant-${t.perTxUsd + 5000}`}
              onClick={() => simulate("merchant", t.perTxUsd + 5000)}
            />
          </div>

          <div className="mt-4 min-h-[84px]">
            <AnimatePresence mode="wait">
              {verdict && (
                <motion.div
                  key={`${verdict.to}-${verdict.label}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={verdict.ok ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.34 }}
                  className={`flex items-start gap-3 rounded-2xl border p-4 ${
                    verdict.ok
                      ? "border-accent/30 bg-accent-soft"
                      : "border-danger/30 bg-danger-soft"
                  }`}
                >
                  {verdict.ok ? (
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  ) : (
                    <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  )}
                  <div>
                    <div className={`text-sm font-semibold ${verdict.ok ? "text-accent" : "text-danger"}`}>
                      {verdict.ok ? "Allowed — executes" : "Blocked — reverts on-chain"}
                    </div>
                    <div className="mt-0.5 text-xs text-ink/70">{verdict.label}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <a
            href={txUrl(DEMO.rogueTx)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-faint transition-colors hover:text-ink"
          >
            <X className="h-3 w-3 text-danger" />
            Not a mock — a real reverted rogue tx on Mantle ↗
          </a>
        </div>
      </div>
    </Card>
  );
}

function SimButton({
  label,
  sub,
  onClick,
  busy,
  danger = false,
}: {
  label: string;
  sub: string;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`ring-ink group flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-all hover:shadow-sm disabled:opacity-50 ${
        danger ? "border-danger/20 hover:border-danger/40" : "border-line hover:border-line-strong"
      }`}
    >
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-faint">{sub}</div>
      </div>
      <span className={`text-xs ${busy ? "text-faint" : danger ? "text-danger/60" : "text-accent/60"}`}>
        {busy ? "…" : "simulate →"}
      </span>
    </button>
  );
}
