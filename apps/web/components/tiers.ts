// Monochrome trust ramp: tier reads as brightness (T0 dim -> T3 pure white).
// Literal class strings so Tailwind's scanner keeps them; hex is for inline SVG strokes.
export const TIER_STYLE = [
  { text: "text-t0", soft: "bg-t0/10", ring: "ring-t0/20", hex: "#9b9b9b" },
  { text: "text-t1", soft: "bg-t1/10", ring: "ring-t1/20", hex: "#bdbdbd" },
  { text: "text-t2", soft: "bg-t2/10", ring: "ring-t2/20", hex: "#dadada" },
  { text: "text-t3", soft: "bg-t3/12", ring: "ring-t3/25", hex: "#fafafa" },
] as const;

export const tierHex = (tier: number): string => TIER_STYLE[Math.min(3, Math.max(0, tier))]!.hex;
