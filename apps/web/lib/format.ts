/** 6-decimal base units -> USD string. */
export function usd(base: string | number | bigint, compact = false): string {
  const n = Number(base) / 1e6;
  if (compact && n >= 1000) {
    return `$${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  }
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: n < 100 && n > 0 ? 2 : 0,
  });
}

export const num = (base: string | number | bigint): number => Number(base) / 1e6;

export const shortAddr = (a?: string): string =>
  a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? "—";

export const shortHash = (h?: string): string =>
  h && h.length > 16 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h ?? "—";

export const bps = (b: number): string => `${(b / 100).toFixed(2)}%`;

export const ZERO = "0x0000000000000000000000000000000000000000";
export const isZero = (a?: string): boolean => !a || a.toLowerCase() === ZERO;

export const ago = (unixSec: string | number): string => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(unixSec));
  if (!Number(unixSec)) return "—";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
