import { dark, statusColors, diffColors, prColors } from "@hive/tokens"

export { statusColors, diffColors, prColors }

/**
 * Shorthand color constants for use in React Native inline styles.
 * All values come from @hive/tokens — the single source of truth.
 */
export const c = {
  // Base
  bg:          dark.background,       // #1c1917 — screen background
  card:        dark.card,             // #292524 — card / panel bg
  secondary:   dark.secondary,        // #3c3835 — elevated / secondary bg
  border:      dark.border,           // rgba(255,255,255,0.10)
  fg:          dark.foreground,       // #fafaf9 — primary text
  fgSub:       dark.mutedForeground,  // #a8a29e — muted / secondary text
  fgBright:    dark.primary,          // #e7e5e4 — near-white (inline bold etc.)
  placeholder: dark.placeholder,      // #57534e — input placeholder

  // Semantic aliases
  success:     diffColors.addition,               // #34d399
  error:       diffColors.deletion,               // #f87171
  warning:     statusColors["in-progress"].color, // #fbbf24
  link:        statusColors["in-review"].color,   // #60a5fa

  // Diff backgrounds
  addBg:  diffColors.additionBg,
  delBg:  diffColors.deletionBg,

  // PR colors
  merged:  prColors.merged,  // #a78bfa

  // Product blue — CTA buttons, active states (not a palette token)
  primary:     '#3b82f6',
  primaryDark: '#1d4ed8',
  white:       '#ffffff',
} as const
