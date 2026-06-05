export const nowSec = (): number => Math.floor(Date.now() / 1000);

/// Recursively convert bigints to strings so values are JSON-serializable (viem returns
/// uint256 fields as bigint).
export function jsonSafe(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) o[k] = jsonSafe(val);
    return o;
  }
  return v;
}
