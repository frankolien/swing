"use client";

import { Activity } from "lucide-react";
import type { SwingEvent } from "@/lib/api";
import { Card, ExplorerLink } from "./ui";

const META: Record<string, { label: string; color: string }> = {
  ReputationCommitted: { label: "Reputation committed", color: "var(--color-t2)" },
  LineOpened: { label: "Credit line opened", color: "var(--color-accent)" },
  Drawn: { label: "Capital drawn", color: "var(--color-ink)" },
  Repaid: { label: "Repaid", color: "var(--color-accent)" },
  LimitRefreshed: { label: "Limit refreshed", color: "var(--color-t2)" },
  Liquidated: { label: "Liquidated", color: "var(--color-danger)" },
  SpendAllowed: { label: "Spend allowed", color: "var(--color-accent)" },
};

export function ActivityFeed({ events }: { events: SwingEvent[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b hairline px-6 py-4">
        <Activity className="h-4 w-4 text-faint" />
        <h2 className="font-display text-xl text-ink">On-chain activity</h2>
      </div>
      <div className="divide-y hairline">
        {events.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-faint">
            No indexed events yet — they appear as the engine commits.
          </div>
        )}
        {events.slice(0, 8).map((e, i) => {
          const m = META[e.type] ?? { label: e.type, color: "var(--color-faint)" };
          return (
            <div key={`${e.txHash}-${i}`} className="flex items-center justify-between px-6 py-3.5">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
                <div>
                  <div className="text-sm text-ink">{m.label}</div>
                  <div className="text-xs text-faint tnum">
                    {e.agentId ? `agent #${e.agentId} · ` : ""}block {e.blockNumber}
                  </div>
                </div>
              </div>
              {e.txHash && <ExplorerLink hash={e.txHash} kind="tx" className="text-xs" />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
