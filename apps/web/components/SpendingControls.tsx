"use client";

import { TIERS } from "@swing/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { DEMO } from "@/lib/config";
import { isZero, usd } from "@/lib/format";
import { Card, ExplorerLink, Label } from "./ui";

type Target = "merchant" | "attacker";
type Verdict = {
  ok: boolean;
  label: string;
  amount: number;
  to: Target;
  txHash: string;
} | null;

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

  // Submit a REAL spend through the GuardedAccount. An allowlisted, in-bounds transfer executes;
  // a rogue or oversized one mines as a reverted tx — the on-chain proof, generated on click.
  async function execute(to: Target, amountUsd: number) {
    if (!ready || busy) return;
    const key = `${to}-${amountUsd}`;
    setBusy(key);
    setVerdict(null);
    try {
      const res = await api.spend({ account, to: DEMO[to], amountUsd });
      setVerdict({ ok: res.ok, label: res.label, amount: amountUsd, to, txHash: res.txHash });
    } catch {
      setVerdict(null);
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
            reverts inside the transaction — funds never move. Each button below submits a{" "}
            <span className="text-ink">real transaction</span> to Mantle Sepolia.
          </p>
        </div>

        {/* live executor */}
        <div className="p-6">
          <Label>Execute a spend</Label>
          <div className="mt-3 grid gap-2">
            <SpendButton
              label="Pay merchant"
              sub="$1,000 · allowlisted"
              pending={busy === "merchant-1000"}
              disabled={!!busy}
              onClick={() => execute("merchant", 1000)}
            />
            <SpendButton
              label="Drain to attacker"
              sub="$1,000 · not allowlisted"
              danger
              pending={busy === "attacker-1000"}
              disabled={!!busy}
              onClick={() => execute("attacker", 1000)}
            />
            <SpendButton
              label="Oversized payout"
              sub={`$${(t.perTxUsd + 5000).toLocaleString()} · over per-tx cap`}
              danger
              pending={busy === `merchant-${t.perTxUsd + 5000}`}
              disabled={!!busy}
              onClick={() => execute("merchant", t.perTxUsd + 5000)}
            />
          </div>

          <div className="mt-4 min-h-[96px]">
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-3 rounded-2xl border hairline bg-paper-2/40 p-4"
                >
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-faint" />
                  <div>
                    <div className="text-sm font-medium text-ink">Submitting to Mantle…</div>
                    <div className="mt-0.5 text-xs text-faint">
                      signing + mining the transaction (~10s)
                    </div>
                  </div>
                </motion.div>
              ) : (
                verdict && (
                  <motion.div
                    key={`${verdict.to}-${verdict.txHash}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={
                      verdict.ok
                        ? { opacity: 1, y: 0 }
                        : { opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }
                    }
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.34 }}
                    className={`flex items-start gap-3 rounded-2xl border p-4 ${
                      verdict.ok ? "border-accent/30 bg-accent-soft" : "border-danger/30 bg-danger-soft"
                    }`}
                  >
                    {verdict.ok ? (
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    ) : (
                      <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-semibold ${
                          verdict.ok ? "text-accent" : "text-danger"
                        }`}
                      >
                        {verdict.ok ? "Allowed — executed on-chain" : "Blocked — reverted on-chain"}
                      </div>
                      <div className="mt-0.5 text-xs text-ink/70">{verdict.label}</div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span
                          className={`tnum rounded-full px-2 py-0.5 ${
                            verdict.ok
                              ? "bg-accent/10 text-accent"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          status {verdict.ok ? "1 · success" : "0 · reverted"}
                        </span>
                        <ExplorerLink hash={verdict.txHash} kind="tx" />
                      </div>
                    </div>
                  </motion.div>
                )
              )}
            </AnimatePresence>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            No mocks — every verdict above is a transaction mined on Mantle Sepolia. The reverts
            carry the guard&apos;s typed error; click through to the explorer to verify status.
          </p>
        </div>
      </div>
    </Card>
  );
}

function SpendButton({
  label,
  sub,
  onClick,
  pending,
  disabled = false,
  danger = false,
}: {
  label: string;
  sub: string;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`ring-ink group flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-all hover:shadow-sm disabled:opacity-50 ${
        danger ? "border-danger/20 hover:border-danger/40" : "border-line hover:border-line-strong"
      }`}
    >
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-faint">{sub}</div>
      </div>
      <span className={`text-xs ${pending ? "text-faint" : danger ? "text-danger/60" : "text-accent/60"}`}>
        {pending ? "…" : "execute →"}
      </span>
    </button>
  );
}
