"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAIN_NAME, EXPLORER } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { Dot } from "./ui";

const LINKS = [
  { href: "/console", label: "Console" },
  { href: "/agents", label: "Agents" },
  { href: "/vault", label: "Vault" },
  { href: "/launch", label: "Launch" },
];

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-line-strong">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-ink" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">the swing</span>
    </Link>
  );
}

export function SiteHeader({ engineUp }: { engineUp?: boolean | null }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b hairline bg-paper/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Wordmark />
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "text-ink" : "text-faint hover:text-muted"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 rounded-full border hairline bg-card px-3 py-1.5 text-xs text-ink lg:inline-flex">
            <Dot color={engineUp === false ? "var(--color-danger)" : "var(--color-ink)"} pulse={engineUp !== false} />
            {CHAIN_NAME}
          </span>
          <a
            href={EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1 text-xs text-faint hover:text-ink sm:inline-flex"
          >
            explorer <ArrowUpRight className="h-3 w-3" />
          </a>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-col items-center gap-1.5 px-6 pt-10 pb-12 text-center text-xs text-faint">
      <div>
        earn → reputation → credit → deploy → <span className="text-danger">rogue-reject</span> · every step a
        verifiable Mantle event
      </div>
      <div>Turing Test Hackathon 2026 · Mantle × Bybit × Byreal × BGA</div>
    </footer>
  );
}
