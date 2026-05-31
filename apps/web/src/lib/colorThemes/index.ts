// Public surface — consumers import from "@/lib/colorThemes".
//
// DEPTH HIERARCHY (dark themes):
//   --sidebar    = darkest (root window, sidebar bg)
//   --background = same as sidebar (gap color between panels)
//   --card       = elevated panels (chat, file tree, terminal)
//   --accent     = interactive states (hover, active tabs)
//
// IMPORTANT:
//   - terminal.background MUST match --card so the terminal blends with its panel
//   - No component should set bg-background on a panel wrapper (use transparent)
//   - bg-card is set by the rounded-xl panel wrappers in the layout
export type { TerminalColors, ColorTheme } from "./types"
export { getColorTheme, getLightColorTheme, setColorTheme, applyColorTheme } from "./state"
export { colorThemes } from "./themes/index"
