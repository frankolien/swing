"use client";

import { Rocket } from "lucide-react";
import { MyAgents } from "@/components/MyAgents";
import { OperatorLaunch } from "@/components/OperatorLaunch";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function LaunchPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-faint" />
          <h1 className="font-display text-4xl text-ink">Launch an agent</h1>
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Turn a wallet into a credit-backed agent: the engine attests its reputation, then you sign
          its guarded account, credit line, and first draw. Everything below is a real transaction
          on Mantle Sepolia — owned by your wallet, not ours.
        </p>

        <div className="mt-8">
          <OperatorLaunch />
        </div>

        <div className="mt-10">
          <MyAgents />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
