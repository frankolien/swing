import { tierMeta } from "@swing/shared";
import { oracle, manager } from "./chain.js";
import { jsonSafe } from "./util.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const IDS = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n];

let cache: unknown[] = [];

/// Sequentially scan a small id range (the public RPC dislikes concurrent reads) and cache the
/// agents that have a score or an open line. Served instantly by GET /agents.
async function refresh(): Promise<void> {
  const out: unknown[] = [];
  for (const id of IDS) {
    try {
      const reputation = await oracle.read.getReputation([id]);
      const line = await manager.read.getLine([id]);
      if (reputation.score > 0 || (line.account && line.account !== ZERO)) {
        out.push(
          jsonSafe({
            agentId: id.toString(),
            reputation: { ...reputation, tierName: tierMeta(reputation.score).name },
            line,
          })
        );
      }
    } catch {
      // RPC hiccup on this id — keep whatever we had, try again next cycle
    }
  }
  if (out.length) cache = out;
}

export function getRegistry(): unknown[] {
  return cache;
}

export function startRegistry(intervalMs = 20_000): void {
  void refresh();
  setInterval(() => void refresh(), intervalMs);
}
