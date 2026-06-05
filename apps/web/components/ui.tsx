"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useState } from "react";
import { addrUrl, txUrl } from "@/lib/config";
import { shortAddr, shortHash } from "@/lib/format";

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`label ${className}`}>{children}</div>;
}

export function Dot({ color = "var(--color-accent)", pulse = false }: { color?: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function ExplorerLink({
  hash,
  kind = "address",
  className = "",
}: {
  hash: string;
  kind?: "address" | "tx";
  className?: string;
}) {
  const href = kind === "tx" ? txUrl(hash) : addrUrl(hash);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`mono group inline-flex items-center gap-1 text-ink/70 transition-colors hover:text-ink ${className}`}
    >
      {kind === "tx" ? shortHash(hash) : shortAddr(hash)}
      <ArrowUpRight className="h-3 w-3 opacity-50 transition-transform group-hover:translate-x-px group-hover:-translate-y-px" />
    </a>
  );
}

export function Copyable({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="mono ring-ink inline-flex items-center gap-1.5 text-ink/70 transition-colors hover:text-ink"
    >
      {label ?? shortAddr(text)}
      {done ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3 opacity-40" />}
    </button>
  );
}
