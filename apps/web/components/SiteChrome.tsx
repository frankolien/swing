"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
      <span className="grid h-12 w-12 place-items-center rounded-[7px] border border-line-strong bg-white/5">
        <Image src="/swing_logo.png" alt="The Swing logo" width={30} height={30} className="object-contain" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">the swing</span>
    </Link>
  );
}

export function SiteHeader({ engineUp }: { engineUp?: boolean | null }) {
  const path = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
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
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "text-ink" : "text-faint hover:text-muted"
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

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-faint hover:text-ink transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <nav
          className="fixed h-fit border-b border-[#262626] inset-0 top-[73px] z-20 bg-paper/95 backdrop-blur-md md:hidden animate-in fade-in slide-in-from-top-2 duration-300"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="flex flex-col px-6 py-4 gap-1" onClick={(e) => e.stopPropagation()}>
            {LINKS.map((l) => {
              const active = path.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-md px-4 py-3 text-base transition-colors ${active ? "text-ink bg-card-2" : "text-faint hover:text-muted"
                    }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="overflow-hidden w-full bg-paper/60 pt-16 text-center text-xs text-faint">

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-1.5 px-6 z-10">
        <div>
          earn → reputation → credit → deploy → <span className="text-danger">rogue-reject</span> · every step a
          verifiable Mantle event
        </div>
        <div>Turing Test Hackathon 2026 · Mantle × Bybit × Byreal × BGA</div>
      </div>

      <div className="pointer-events-none inset-x-0 -z-10 w-full">
        <p className="w-full whitespace-nowrap text-center font-display text-[clamp(5rem,20vw,14rem)] font-black uppercase tracking-[-0.02em] text-ink/10">
          The Swing
        </p>
      </div> 
    </footer>
  );
}
