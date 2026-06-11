"use client";

import { Ban, Check, Cpu, Fuel, ShieldCheck, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type AaSpendKind, type AaSpendResult, type AaState } from "@/lib/api";
import { Card, ExplorerLink, Label } from "./ui";

const KINDS: { kind: AaSpendKind; title: string; sub: string; rogue: boolean }[] = [
  { kind: "allowed", title: "Pay merchant", sub: "$1,000 → allowlisted", rogue: false },
  { kind: "rogueDest", title: "Drain to attacker", sub: "$1,000 → not allowlisted", rogue: true },
  { kind: "rogueCap", title: "Oversized payout", sub: "$3,000 → over the $2k cap", rogue: true },
];

export function AaPanel() {
  const [state, setState] = useState<AaState | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState<AaSpendKind | null>(null);
  const [results, setResults] = useState<Partial<Record<AaSpendKind, AaSpendResult>>>({});

  const load = useCallback(async () => {
    try {
      setState(await api.aaState());
    } catch {
      setState({ ready: false, reason: "engine unreachable", explorer: "" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const prepare = useCallback(async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      setState((await api.aaPrepare()).state);
    } catch {
      /* leave state as-is; the button stays available to retry */
    } finally {
      setPreparing(false);
    }
  }, [preparing]);

  const spend = useCallback(
    async (kind: AaSpendKind) => {
      if (busy) return;
      setBusy(kind);
      try {
        const r = await api.aaSpend(kind);
        setResults((p) => ({ ...p, [kind]: r }));
        load(); // refresh balance
      } catch {
        setResults((p) => ({ ...p, [kind]: { kind, label: "", to: "", amountUsd: 0, outcome: "refused", reason: "request failed" } }));
      } finally {
        setBusy(null);
      }
    },
    [busy, load]
  );

  const installed = Boolean(state?.validatorInstalled);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b hairline px-6 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-faint" />
          <h2 className="font-display text-xl text-ink">Spending guard · ERC-7579</h2>
        </div>
        <span className="rounded-full border hairline px-2.5 py-1 text-[11px] text-muted">
          Kernel v3.1 · Pimlico · gas sponsored
        </span>
      </div>

      {state && !state.ready ? (
        <div className="p-6">
          <p className="text-sm leading-relaxed text-faint">
            Live account abstraction is off. Set <span className="mono text-ink">PIMLICO_API_KEY</span>{" "}
            (free at{" "}
            <a className="text-ink underline-offset-2 hover:underline" href="https://dashboard.pimlico.io" target="_blank" rel="noreferrer">
              dashboard.pimlico.io
            </a>
            ) and restart the engine to run the guard on a real Kernel smart account.
          </p>
          {state.reason && <p className="mt-2 text-xs text-faint">{state.reason}</p>}
        </div>
      ) : (
        <div className="grid gap-0 sm:grid-cols-2">
          {/* the account + policy */}
          <div className="space-y-4 border-b hairline p-6 sm:border-b-0 sm:border-r">
            <div>
              <Label>Kernel v3.1 smart account</Label>
              <div className="mt-1 flex items-center gap-2 text-sm">
                {state?.account ? <ExplorerLink hash={state.account} kind="address" /> : <span className="text-faint">loading…</span>}
                {state?.deployed && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">deployed</span>
                )}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
                <Fuel className="h-3.5 w-3.5" /> gas paid by Pimlico&apos;s paymaster — the owner key holds no funds
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Per-tx cap" value={state?.policy ? `$${state.policy.perTxCapUsd.toLocaleString()}` : "—"} />
              <Stat label="Daily limit" value={state?.policy ? `$${state.policy.dailyLimitUsd.toLocaleString()}` : "—"} />
              <Stat label="Balance" value={state?.balanceUsd != null ? `$${state.balanceUsd.toLocaleString()}` : "—"} />
            </div>

            {installed ? (
              <div className="flex items-center gap-1.5 text-xs text-accent">
                <Cpu className="h-3.5 w-3.5" /> SpendingGuardValidator + Hook installed on-chain
              </div>
            ) : (
              <button
                onClick={prepare}
                disabled={preparing}
                className="ring-ink inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-paper transition-all hover:bg-ink/90 disabled:opacity-50"
              >
                {preparing ? (
                  <>
                    <Zap className="h-4 w-4 animate-pulse" /> deploying + installing modules…
                  </>
                ) : (
                  <>
                    <Cpu className="h-4 w-4" /> Set up the guarded account
                  </>
                )}
              </button>
            )}
            <p className="text-[11px] leading-relaxed text-faint">
              The agent&apos;s session key (validator) drives the account; every spend it makes is metered
              by the hook — the same <span className="text-ink">SpendingGuardLib</span> as the standalone
              GuardedAccount, one layer up on a real modular account.
            </p>
          </div>

          {/* the guarded spends */}
          <div className="space-y-3 p-6">
            <Label>Spend through the agent validator</Label>
            {KINDS.map(({ kind, title, sub, rogue }) => {
              const r = results[kind];
              const pending = busy === kind;
              return (
                <div key={kind} className="rounded-lg border hairline p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink">{title}</div>
                      <div className="text-[11px] text-faint">{sub}</div>
                    </div>
                    <button
                      onClick={() => spend(kind)}
                      disabled={!installed || Boolean(busy)}
                      className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${
                        rogue ? "border-danger/40 text-danger hover:bg-danger-soft" : "hairline text-ink hover:bg-paper-2"
                      }`}
                    >
                      {pending ? "sending…" : "send"}
                    </button>
                  </div>
                  {r && !pending && (
                    <div className="mt-2.5 border-t hairline pt-2.5">
                      {r.outcome === "mined" ? (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 text-accent">
                            <Check className="h-3.5 w-3.5" /> Allowed — UserOp mined
                          </span>
                          {r.txHash && <ExplorerLink hash={r.txHash} kind="tx" />}
                        </div>
                      ) : (
                        <div className="flex items-start gap-1.5 text-xs text-danger">
                          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Refused — <span className="mono break-all">{r.reason}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] leading-relaxed text-faint">
              A rogue spend can&apos;t even enter the mempool: the hook&apos;s <span className="text-ink">preCheck</span>{" "}
              reverts, so Pimlico refuses to bundle it. Same enforcement as the mined-status-0
              GuardedAccount demo, surfaced at the bundler.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-faint leading-tight min-h-[2.4em] sm:min-h-0">{label}</div>
      <div className="tnum mt-0.5 text-sm text-ink">{value}</div>
    </div>
  );
}
