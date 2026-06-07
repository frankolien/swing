"use client";

import { Coins, Loader2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { CONTRACTS, txUrl } from "@/lib/config";
import { erc20Abi, vaultAbi } from "@/lib/contracts";
import { ConnectButton } from "./ConnectButton";
import { useMantleGuard, WrongNetworkBanner } from "./Network";
import { Card, Label } from "./ui";

const USDC = CONTRACTS.MockUSDC as `0x${string}`;
const VAULT = CONTRACTS.CreditVault as `0x${string}`;
const fmt = (v?: bigint) =>
  v == null ? "—" : Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function LenderPanel() {
  const { address, isConnected } = useAccount();
  const { wrongNetwork } = useMantleGuard();
  const [amount, setAmount] = useState("1000");
  const [action, setAction] = useState<string | null>(null);

  const reads = useReadContracts({
    contracts: address
      ? [
          { address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] },
          { address: USDC, abi: erc20Abi, functionName: "allowance", args: [address, VAULT] },
          { address: VAULT, abi: vaultAbi, functionName: "balanceOf", args: [address] },
          { address: VAULT, abi: vaultAbi, functionName: "maxWithdraw", args: [address] },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const usdcBal = reads.data?.[0]?.result as bigint | undefined;
  const allowance = reads.data?.[1]?.result as bigint | undefined;
  const shares = reads.data?.[2]?.result as bigint | undefined;
  const withdrawable = reads.data?.[3]?.result as bigint | undefined;

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      reads.refetch();
      const t = setTimeout(() => {
        setAction(null);
        reset();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reads, reset]);

  const wei = useMemo(() => {
    try {
      return parseUnits(amount || "0", 6);
    } catch {
      return 0n;
    }
  }, [amount]);
  const needsApproval = (allowance ?? 0n) < wei;
  const busy = isPending || confirming;
  const locked = busy || wrongNetwork; // block writes off Mantle

  const run = (label: string, fn: () => void) => {
    setAction(label);
    fn();
  };

  if (!isConnected) {
    return (
      <Card className="p-6">
        <Label>Provide liquidity</Label>
        <p className="mt-3 mb-5 text-sm leading-relaxed text-muted">
          Connect a wallet on Mantle Sepolia to deposit USDC and earn yield from agent borrowing.
          You&apos;ll receive scUSDC shares — the lender side of the protocol.
        </p>
        <ConnectButton />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <WrongNetworkBanner />
      <div className="flex items-center justify-between">
        <Label>Your position</Label>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 border-b hairline pb-5">
        <div>
          <div className="label">Deposited (scUSDC)</div>
          <div className="mt-1 tnum text-2xl text-ink">${fmt(withdrawable)}</div>
          <div className="text-[11px] text-faint tnum">{fmt(shares)} shares</div>
        </div>
        <div className="text-right">
          <div className="label">Wallet USDC</div>
          <div className="mt-1 tnum text-2xl text-ink">${fmt(usdcBal)}</div>
          <button
            onClick={() => run("faucet", () => writeContract({ address: USDC, abi: erc20Abi, functionName: "mint", args: [address!, parseUnits("10000", 6)] }))}
            disabled={locked}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-ink disabled:opacity-50"
          >
            <Coins className="h-3 w-3" /> get 10k test USDC
          </button>
        </div>
      </div>

      <div className="mt-5">
        <Label>Deposit</Label>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-lg border hairline bg-paper-2/40 px-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="w-full bg-transparent py-2.5 text-sm text-ink outline-none tnum"
              placeholder="0"
            />
            <span className="text-xs text-faint">USDC</span>
          </div>
          {needsApproval ? (
            <ActionButton
              label="Approve"
              busy={busy && action === "approve"}
              disabled={locked || wei === 0n}
              onClick={() => run("approve", () => writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [VAULT, wei] }))}
            />
          ) : (
            <ActionButton
              label="Deposit"
              primary
              busy={busy && action === "deposit"}
              disabled={locked || wei === 0n || (usdcBal ?? 0n) < wei}
              onClick={() => run("deposit", () => writeContract({ address: VAULT, abi: vaultAbi, functionName: "deposit", args: [wei, address!] }))}
            />
          )}
        </div>

        {(shares ?? 0n) > 0n && (
          <button
            onClick={() => run("withdraw", () => writeContract({ address: VAULT, abi: vaultAbi, functionName: "redeem", args: [shares!, address!, address!] }))}
            disabled={locked}
            className="mt-3 w-full rounded-lg border hairline py-2 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            {busy && action === "withdraw" ? "withdrawing…" : "Withdraw all"}
          </button>
        )}

        {hash && (
          <a
            href={txUrl(hash)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-center text-[11px] text-faint hover:text-ink"
          >
            {confirming ? "confirming" : isSuccess ? "confirmed" : "submitted"} · {hash.slice(0, 10)}… ↗
          </a>
        )}
      </div>
    </Card>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`ring-ink inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 ${
        primary ? "bg-ink text-paper hover:bg-ink/90" : "border border-line-strong text-ink hover:bg-paper-2"
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
