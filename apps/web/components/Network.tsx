"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { MANTLE_SEPOLIA } from "@/lib/wagmi";

// Passed to wallet_addEthereumChain when the wallet doesn't have Mantle Sepolia yet, so the
// "Add network" prompt is fully populated (RPC, native MNT, explorer) instead of relying on
// wallet defaults. wagmi falls back to this automatically on a 4902 "unknown chain" error.
const ADD_PARAMS = {
  chainName: "Mantle Sepolia Testnet",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: ["https://rpc.sepolia.mantle.xyz"],
  blockExplorerUrls: ["https://sepolia.mantlescan.xyz"],
};

/// Single source of truth for "is the connected wallet on Mantle Sepolia?" plus a switch action
/// that also *adds* the chain if the wallet has never seen it.
export function useMantleGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const onMantle = chainId === MANTLE_SEPOLIA.id;
  return {
    isConnected,
    onMantle,
    wrongNetwork: isConnected && !onMantle,
    switching: isPending,
    switchToMantle: () =>
      switchChain({ chainId: MANTLE_SEPOLIA.id, addEthereumChainParameter: ADD_PARAMS }),
  };
}

/// One-shot auto-prompt to switch (or add) Mantle Sepolia the moment a connected wallet is on the
/// wrong chain. Mount this ONCE (it lives in the header ConnectButton) so it can't fire from
/// multiple components. The ref keys on chainId so a dismissed prompt won't re-spam — but moving to
/// a *different* wrong chain re-prompts.
export function useAutoSwitchMantle() {
  const { wrongNetwork, switchToMantle } = useMantleGuard();
  const chainId = useChainId();
  const tried = useRef<number | null>(null);
  useEffect(() => {
    if (wrongNetwork && tried.current !== chainId) {
      tried.current = chainId;
      switchToMantle();
    }
  }, [wrongNetwork, chainId, switchToMantle]);
}

/// Pill-styled switch button (header). Returns null unless connected + on the wrong chain.
export function SwitchToMantleButton() {
  const { wrongNetwork, switching, switchToMantle } = useMantleGuard();
  if (!wrongNetwork) return null;
  return (
    <button
      onClick={switchToMantle}
      disabled={switching}
      className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft px-3.5 py-1.5 text-xs font-medium text-danger transition-colors disabled:opacity-50"
    >
      {switching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {switching ? "switching…" : "Switch to Mantle Sepolia"}
    </button>
  );
}

/// Full-width banner for panels with signing actions. Render it above the action area; the panel
/// should also disable its write buttons while `wrongNetwork` is true so a tx can't fire on the
/// wrong chain (which would otherwise throw a cryptic ChainMismatchError).
export function WrongNetworkBanner() {
  const { wrongNetwork, switching, switchToMantle } = useMantleGuard();
  if (!wrongNetwork) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-xs text-ink">
      <span>
        <span className="font-medium text-danger">Wrong network.</span> Switch to Mantle Sepolia to
        sign — your wallet will be asked to add it if needed.
      </span>
      <button
        onClick={switchToMantle}
        disabled={switching}
        className="shrink-0 rounded-md border border-danger/40 px-2.5 py-1 font-medium text-danger transition-colors disabled:opacity-50"
      >
        {switching ? "switching…" : "Switch"}
      </button>
    </div>
  );
}
