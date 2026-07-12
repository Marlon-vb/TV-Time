/**
 * TV Time design system: deep-space navy, a single confident yellow,
 * Space Grotesk for display type (system SF for body), soft hairline
 * borders, and one gradient used everywhere accent color appears.
 */
export const colors = {
  ink: "#0b0c14",
  surface: "#141623",
  raised: "#1c1f31",
  overlay: "#272b44",
  line: "rgba(255,255,255,0.07)",
  lineStrong: "rgba(255,255,255,0.12)",
  accent: "#fbd737",
  accentDeep: "#f5a623",
  fg: "#f4f5fa",
  muted: "#9aa0b8",
  faint: "#666c8a",
  danger: "#ff5c72",
  ok: "#4ade80",
} as const;

/** Yellow → amber; the one accent gradient (progress, active states, badges). */
export const accentGradient = ["#fbd737", "#f5a623"] as const;

/** Scrim used over imagery so text always sits on ink. */
export const scrimGradient = [
  "rgba(11,12,20,0.10)",
  "rgba(11,12,20,0.72)",
  "rgba(11,12,20,1)",
] as const;

export const fonts = {
  display: "SpaceGrotesk_700Bold",
  displayMedium: "SpaceGrotesk_500Medium",
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

/** Bottom padding for scroll views so content clears the floating tab bar. */
export const TAB_BAR_CLEARANCE = 118;
