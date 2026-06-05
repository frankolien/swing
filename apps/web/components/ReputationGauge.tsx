"use client";

import { motion, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { tierHex, TIER_STYLE } from "./tiers";

const SIZE = 300;
const STROKE = 18;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - STROKE - 12;
const START = 225;
const SWEEP = 270;

function polar(angle: number, r = R) {
  const a = ((angle - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

const TRACK = (() => {
  const p0 = polar(START);
  const p1 = polar(START + SWEEP);
  return `M ${p0.x} ${p0.y} A ${R} ${R} 0 1 1 ${p1.x} ${p1.y}`;
})();

function Counter({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 70, damping: 18, mass: 0.8 });
  const [shown, setShown] = useState(0);
  useEffect(() => spring.on("change", (v) => setShown(Math.round(v))), [spring]);
  useEffect(() => spring.set(value), [spring, value]);
  return <span className="tnum">{shown}</span>;
}

export function ReputationGauge({
  score,
  tier,
  tierName,
}: {
  score: number;
  tier: number;
  tierName: string;
}) {
  const fraction = Math.min(1, Math.max(0, score / 1000));
  const hex = tierHex(tier);
  const ticks = [250, 500, 750].map((t) => START + SWEEP * (t / 1000));

  return (
    <div className="relative grid place-items-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="absolute inset-0">
        <path d={TRACK} fill="none" stroke="var(--color-line-strong)" strokeWidth={STROKE} strokeLinecap="round" />
        {ticks.map((a, i) => {
          const o = polar(a, R + STROKE / 2 + 4);
          const inr = polar(a, R - STROKE / 2 - 4);
          return (
            <line
              key={i}
              x1={inr.x}
              y1={inr.y}
              x2={o.x}
              y2={o.y}
              stroke="var(--color-faint)"
              strokeWidth={1.5}
              opacity={0.5}
            />
          );
        })}
        <motion.path
          d={TRACK}
          fill="none"
          stroke={hex}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 1 - fraction }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
          style={{ filter: `drop-shadow(0 2px 7px ${hex}59)` }}
        />
      </svg>

      <div className="flex flex-col items-center">
        <div className="font-display text-[68px] leading-none text-ink" style={{ fontVariationSettings: '"opsz" 40' }}>
          <Counter value={score} />
        </div>
        <div className="mt-1 text-sm text-faint">
          <span className="tnum">/ 1000</span>
        </div>
        <motion.div
          key={tierName}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 ${TIER_STYLE[Math.min(3, tier)]!.soft} ${TIER_STYLE[Math.min(3, tier)]!.ring} ${TIER_STYLE[Math.min(3, tier)]!.text}`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
          T{tier} · {tierName}
        </motion.div>
      </div>
    </div>
  );
}
