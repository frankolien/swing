// Literal class strings so Tailwind's scanner keeps them. hex is for inline SVG/gauge strokes.
export const TIER_STYLE = [
  { text: "text-t0", soft: "bg-t0/10", ring: "ring-t0/25", hex: "#8a8578" },
  { text: "text-t1", soft: "bg-t1/10", ring: "ring-t1/25", hex: "#b06a10" },
  { text: "text-t2", soft: "bg-t2/10", ring: "ring-t2/25", hex: "#2563eb" },
  { text: "text-t3", soft: "bg-t3/10", ring: "ring-t3/25", hex: "#157347" },
] as const;

export const tierHex = (tier: number): string => TIER_STYLE[Math.min(3, Math.max(0, tier))]!.hex;
