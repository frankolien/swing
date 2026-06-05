"use client";

import { TIERS } from "@swing/shared";
import { motion } from "framer-motion";
import { TIER_STYLE } from "./tiers";

export function TierLadder({ tier }: { tier: number }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {TIERS.map((t) => {
        const active = t.id === tier;
        const passed = t.id < tier;
        const s = TIER_STYLE[t.id]!;
        return (
          <div key={t.id} className="flex flex-col gap-1.5">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
              {(active || passed) && (
                <motion.div
                  layout
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  className="absolute inset-0 origin-left rounded-full"
                  style={{ background: s.hex }}
                />
              )}
            </div>
            <div className={`text-[11px] font-medium ${active ? s.text : "text-faint"}`}>{t.key}</div>
            <div className={`text-xs ${active ? "text-ink" : "text-faint/70"}`}>{t.name}</div>
          </div>
        );
      })}
    </div>
  );
}
