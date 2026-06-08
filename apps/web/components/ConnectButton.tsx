"use client";

import { LogOut, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { SwitchToMantleButton, useAutoSwitchMantle, useMantleGuard } from "./Network";

export function ConnectButton() {
  // Avoid a hydration flash: wallet state only exists client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { wrongNetwork } = useMantleGuard();
  // Header is mounted once → safe place to own the auto-switch prompt.
  useAutoSwitchMantle();

  if (!mounted) return <div className="h-[30px] w-[132px]" aria-hidden />;

  const injected = connectors[0];
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  if (!isConnected) {
    return (
      <button
        onClick={() => injected && connect({ connector: injected })}
        disabled={isPending || !injected}
        className="ring-ink inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition-all hover:bg-ink/90 disabled:opacity-50"
      >
        <Wallet className="h-3.5 w-3.5" />
        {isPending ? "connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (wrongNetwork) return <SwitchToMantleButton />;

  return (
    <button
      onClick={() => disconnect()}
      title="Disconnect"
      className="group inline-flex items-center gap-1.5 rounded-full border hairline bg-card px-3 py-1.5 text-xs text-ink transition-colors hover:border-line-strong"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink" />
      <span className="mono">{short}</span>
      <LogOut className="h-3 w-3 text-faint transition-colors group-hover:text-ink" />
    </button>
  );
}
