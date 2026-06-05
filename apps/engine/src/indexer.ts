import type { Abi } from "viem";
import { reputationOracleAbi, creditManagerAbi, spendingGuardHookAbi } from "@swing/shared/abis";
import { publicClient, addresses } from "./chain.js";
import { store } from "./store.js";
import { jsonSafe } from "./util.js";

interface Source {
  address: `0x${string}`;
  abi: Abi;
  events: string[];
}

const sources: Source[] = [
  { address: addresses.ReputationOracle, abi: reputationOracleAbi as Abi, events: ["ReputationCommitted"] },
  {
    address: addresses.CreditManager,
    abi: creditManagerAbi as Abi,
    events: ["LineOpened", "Drawn", "Repaid", "LimitRefreshed", "Liquidated"],
  },
  { address: addresses.SpendingGuardHook, abi: spendingGuardHookAbi as Abi, events: ["SpendAllowed"] },
];

const BACKFILL = 2_000n;
let last = 0n;

async function tick(): Promise<void> {
  try {
    const latest = await publicClient.getBlockNumber();
    if (last === 0n) last = latest > BACKFILL ? latest - BACKFILL : 0n;
    if (latest <= last) return;

    for (const s of sources) {
      for (const event of s.events) {
        try {
          const logs = await publicClient.getContractEvents({
            address: s.address,
            abi: s.abi,
            eventName: event,
            fromBlock: last + 1n,
            toBlock: latest,
          });
          for (const log of logs) {
            const args = ((log as { args?: Record<string, unknown> }).args ?? {}) as Record<string, unknown>;
            store.add({
              type: event,
              agentId: args.agentId !== undefined ? String(args.agentId) : undefined,
              blockNumber: (log.blockNumber ?? 0n).toString(),
              txHash: log.transactionHash ?? "",
              data: jsonSafe(args) as Record<string, unknown>,
            });
          }
        } catch {
          // per-event RPC hiccup on a flaky public node; skip and retry next tick
        }
      }
    }
    last = latest;
  } catch {
    // transient; retry next tick
  }
}

export function startIndexer(intervalMs = 12_000): void {
  void tick();
  setInterval(() => void tick(), intervalMs);
}
