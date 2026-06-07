"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { TIERS } from "@swing/shared";
import { api, type OnboardResult } from "@/lib/api";
import { CONTRACTS, txUrl } from "@/lib/config";
import { factoryAbi, managerAbi } from "@/lib/contracts";
import { addMyAgent } from "@/lib/myAgents";
import { ConnectButton } from "./ConnectButton";
import { useMantleGuard, WrongNetworkBanner } from "./Network";
import { Card, Label } from "./ui";

const FACTORY = CONTRACTS.GuardedAccountFactory as `0x${string}`;
const MANAGER = CONTRACTS.CreditManager as `0x${string}`;
const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-4)}`;

export function OperatorLaunch() {
  const { address, isConnected } = useAccount();
  const { wrongNetwork } = useMantleGuard();
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [step, setStep] = useState(0); // 0 score · 1 create · 2 openLine · 3 draw · 4 done
  const [scoring, setScoring] = useState(false);
  const [drawAmount, setDrawAmount] = useState("500");
  const [action, setAction] = useState<string | null>(null);

  const tier = result?.tier ?? 0;
  const tierData = TIERS[Math.min(3, tier)]!;
  const agentId = result ? BigInt(result.agentId) : 0n;
  const cfg = useMemo(
    () => ({
      perTxCap: parseUnits(String(tierData.perTxUsd), 6),
      dailyLimit: parseUnits(String(tierData.dailyUsd), 6),
      frozen: false,
    }),
    [tierData]
  );

  const { data: predicted } = useReadContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: "predict",
    args: result && address ? [agentId, address, address, cfg] : undefined,
    query: { enabled: !!result && !!address },
  });
  const account = predicted as `0x${string}` | undefined;

  const { data: power, refetch: refetchPower } = useReadContract({
    address: MANAGER,
    abi: managerAbi,
    functionName: "borrowingPower",
    args: result ? [agentId] : undefined,
    query: { enabled: step >= 2 && !!result },
  });

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess && action) {
      if (action === "create") setStep(2);
      else if (action === "openLine") {
        setStep(3);
        refetchPower();
      } else if (action === "draw") setStep(4);
      setAction(null);
      reset();
    }
  }, [isSuccess, action, reset, refetchPower]);

  async function scoreAgent() {
    if (!address || scoring) return;
    setScoring(true);
    try {
      const r = await api.onboard(address);
      setResult(r);
      addMyAgent(r.agentId, address); // remember it so a refresh doesn't lose it
      setStep(1);
    } catch {
      /* engine down */
    } finally {
      setScoring(false);
    }
  }

  const busy = isPending || confirming;
  const fire = (a: string, fn: () => void) => {
    setAction(a);
    fn();
  };

  if (!isConnected) {
    return (
      <Card className="p-8 text-center">
        <h2 className="font-display text-2xl text-ink">Launch your agent</h2>
        <p className="mx-auto mt-2 mb-6 max-w-md text-sm leading-relaxed text-muted">
          Connect a wallet on Mantle Sepolia. The engine attests your agent&apos;s reputation, then
          your wallet signs its guarded account and credit line — reputation → credit → spend, owned
          by you.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <h2 className="font-display text-2xl text-ink">Launch your agent</h2>
      <p className="mt-1.5 text-sm text-muted">
        Four steps. The engine attests reputation; <span className="text-ink">your wallet</span>{" "}
        signs the rest.
      </p>

      <div className="mt-6">
        <WrongNetworkBanner />
      </div>

      <div className="mt-1 space-y-1">
        <StepRow
          n={1}
          title="Score your agent"
          done={step > 0}
          active={step === 0}
          detail={
            result ? (
              <span className="tnum">
                agent #{result.agentId} · R {result.score} · {result.tierName}
              </span>
            ) : (
              "engine attests a starter reputation (you can't self-assign it)"
            )
          }
          action={
            step === 0 && (
              <Btn onClick={scoreAgent} busy={scoring} label="Score my agent" primary />
            )
          }
        />
        <StepRow
          n={2}
          title="Create guarded account"
          done={step > 1}
          active={step === 1}
          detail={
            account ? (
              <span className="mono text-[11px]">{account.slice(0, 10)}…{account.slice(-6)}</span>
            ) : (
              "a smart account that meters every spend on-chain"
            )
          }
          action={
            step === 1 && (
              <Btn
                onClick={() =>
                  fire("create", () =>
                    writeContract({
                      address: FACTORY,
                      abi: factoryAbi,
                      functionName: "createAccount",
                      args: [agentId, address!, address!, cfg],
                    })
                  )
                }
                busy={busy && action === "create"}
                disabled={wrongNetwork}
                label="Create account"
                primary
              />
            )
          }
        />
        <StepRow
          n={3}
          title="Open credit line"
          done={step > 2}
          active={step === 2}
          detail={
            step >= 3 && power != null ? (
              <span className="tnum">borrowing power ${Number(formatUnits(power, 6)).toLocaleString()}</span>
            ) : (
              `tier ${tierData.name} · ${tier >= 3 ? "uncollateralized" : tier === 2 ? "50% uncollateralized" : "collateral required"}`
            )
          }
          action={
            step === 2 &&
            account && (
              <Btn
                onClick={() =>
                  fire("openLine", () =>
                    writeContract({
                      address: MANAGER,
                      abi: managerAbi,
                      functionName: "openLine",
                      args: [agentId, account],
                    })
                  )
                }
                busy={busy && action === "openLine"}
                disabled={wrongNetwork}
                label="Open credit line"
                primary
              />
            )
          }
        />
        <StepRow
          n={4}
          title="Draw credit"
          done={step > 3}
          active={step === 3}
          detail="capital lands in your guarded account — spendable only within policy"
          action={
            step === 3 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border hairline bg-paper-2/40 px-2.5">
                  <input
                    value={drawAmount}
                    onChange={(e) => setDrawAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-16 bg-transparent py-2 text-sm text-ink outline-none tnum"
                  />
                  <span className="text-[11px] text-faint">USDC</span>
                </div>
                <Btn
                  onClick={() =>
                    fire("draw", () =>
                      writeContract({
                        address: MANAGER,
                        abi: managerAbi,
                        functionName: "draw",
                        args: [agentId, parseUnits(drawAmount || "0", 6)],
                      })
                    )
                  }
                  busy={busy && action === "draw"}
                  disabled={wrongNetwork}
                  label="Draw"
                  primary
                />
              </div>
            )
          }
        />
      </div>

      {step === 4 && result && (
        <Link
          href={`/console?agent=${result.agentId}`}
          className="ring-ink mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-paper transition-all hover:bg-ink/90"
        >
          Your agent is live — open its console <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      {hash && (
        <a
          href={txUrl(hash)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center text-[11px] text-faint hover:text-ink"
        >
          {confirming ? "confirming" : isSuccess ? "confirmed" : "submitted"} · {shortHash(hash)} ↗
        </a>
      )}
    </Card>
  );
}

function StepRow({
  n,
  title,
  detail,
  done,
  active,
  action,
}: {
  n: number;
  title: string;
  detail: React.ReactNode;
  done: boolean;
  active: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors ${
        active ? "border-line-strong bg-paper-2/30" : "border-transparent"
      }`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium ${
          done ? "bg-accent text-paper" : active ? "bg-ink text-paper" : "bg-paper-2 text-faint"
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${done || active ? "text-ink" : "text-faint"}`}>{title}</div>
        <div className="mt-0.5 truncate text-xs text-faint">{detail}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Btn({
  onClick,
  label,
  busy,
  primary,
  disabled,
}: {
  onClick: () => void;
  label: string;
  busy?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`ring-ink inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 ${
        primary ? "bg-ink text-paper hover:bg-ink/90" : "border border-line-strong text-ink"
      }`}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </button>
  );
}
