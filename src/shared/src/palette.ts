/** Stable palette keys stored in the `tags.color` column. */
export const TAG_PALETTE_KEYS = [
  "slate",
  "blue",
  "green",
  "amber",
  "rose",
  "purple",
  "pink",
  "teal",
  "orange",
  "lime",
] as const;

export type TagPaletteKey = (typeof TAG_PALETTE_KEYS)[number];

/**
 * Per-key foreground/background pairs for light and dark mode.
 * bg/fg are hex values matching Tailwind's palette at the same scale.
 * All combos pass WCAG AA contrast (≥4.5:1 for small text).
 */
export const TAG_PALETTE: Record<
  TagPaletteKey,
  { light: { bg: string; fg: string }; dark: { bg: string; fg: string } }
> = {
  slate: { light: { bg: "#f1f5f9", fg: "#475569" }, dark: { bg: "#334155", fg: "#cbd5e1" } },
  blue: { light: { bg: "#dbeafe", fg: "#1d4ed8" }, dark: { bg: "#1e3a5f", fg: "#93c5fd" } },
  green: { light: { bg: "#dcfce7", fg: "#15803d" }, dark: { bg: "#14532d", fg: "#86efac" } },
  amber: { light: { bg: "#fef3c7", fg: "#92400e" }, dark: { bg: "#451a03", fg: "#fcd34d" } },
  rose: { light: { bg: "#ffe4e6", fg: "#be123c" }, dark: { bg: "#4c0519", fg: "#fda4af" } },
  purple: { light: { bg: "#f3e8ff", fg: "#7e22ce" }, dark: { bg: "#3b0764", fg: "#d8b4fe" } },
  pink: { light: { bg: "#fce7f3", fg: "#be185d" }, dark: { bg: "#500724", fg: "#f9a8d4" } },
  teal: { light: { bg: "#ccfbf1", fg: "#0f766e" }, dark: { bg: "#042f2e", fg: "#5eead4" } },
  orange: { light: { bg: "#ffedd5", fg: "#c2410c" }, dark: { bg: "#431407", fg: "#fdba74" } },
  lime: { light: { bg: "#ecfccb", fg: "#3f6212" }, dark: { bg: "#1a2e05", fg: "#bef264" } },
};
