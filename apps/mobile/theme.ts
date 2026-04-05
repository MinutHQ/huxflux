import { createContext, useContext } from "react"
import { statusColors, diffColors, prColors } from "@huxflux/tokens"

export { statusColors, diffColors, prColors }

// ── Theme palette definitions ─────────────────────────────────────────────────

export interface ThemePalette {
  bg: string
  card: string
  secondary: string
  border: string
  fg: string
  fgSub: string
  fgBright: string
  fgBrightFg: string
  placeholder: string
}

export interface MobileTheme {
  id: string
  name: string
  swatch: string // preview color for the picker
  palette: ThemePalette
  light?: boolean
}

export const themes: MobileTheme[] = [
  {
    id: "stone",
    name: "Stone",
    swatch: "#1c1917",
    palette: {
      bg: "#1c1917", card: "#292524", secondary: "#3c3835", border: "rgba(255,255,255,0.10)",
      fg: "#fafaf9", fgSub: "#a8a29e", fgBright: "#e7e5e4", fgBrightFg: "#292524", placeholder: "#57534e",
    },
  },
  {
    id: "jarvis",
    name: "Jarvis 3D",
    swatch: "#0a1628",
    palette: {
      bg: "#0a1628", card: "#0f1f3a", secondary: "#162a4a", border: "rgba(240,192,80,0.15)",
      fg: "#e0d8c8", fgSub: "#7a8da8", fgBright: "#f0c050", fgBrightFg: "#0a1628", placeholder: "#4a6080",
    },
  },
  {
    id: "everforest",
    name: "Everforest",
    swatch: "#272e33",
    palette: {
      bg: "#272e33", card: "#2e383c", secondary: "#374145", border: "rgba(167,192,128,0.15)",
      fg: "#d3c6aa", fgSub: "#859289", fgBright: "#a7c080", fgBrightFg: "#272e33", placeholder: "#5c6a60",
    },
  },
  {
    id: "sakura",
    name: "Sakura Drop",
    swatch: "#1a1520",
    palette: {
      bg: "#1a1520", card: "#221c28", secondary: "#2e2538", border: "rgba(242,160,176,0.15)",
      fg: "#e8d8e0", fgSub: "#9a8a98", fgBright: "#f2a0b0", fgBrightFg: "#1a1520", placeholder: "#6a5870",
    },
  },
  {
    id: "aether",
    name: "Aether Night",
    swatch: "#050510",
    palette: {
      bg: "#050510", card: "#0a0a1a", secondary: "#12122a", border: "rgba(180,142,173,0.14)",
      fg: "#d8dee9", fgSub: "#7a80a0", fgBright: "#b48ead", fgBrightFg: "#050510", placeholder: "#484870",
    },
  },
  {
    id: "neo-tokyo",
    name: "Neo Tokyo",
    swatch: "#16161e",
    palette: {
      bg: "#16161e", card: "#1a1b26", secondary: "#24283b", border: "rgba(115,218,202,0.14)",
      fg: "#c0caf5", fgSub: "#6a7094", fgBright: "#73daca", fgBrightFg: "#16161e", placeholder: "#444b6a",
    },
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    swatch: "#1d2021",
    palette: {
      bg: "#1d2021", card: "#282828", secondary: "#32302f", border: "rgba(216,166,87,0.15)",
      fg: "#d4be98", fgSub: "#928374", fgBright: "#d8a657", fgBrightFg: "#1d2021", placeholder: "#665c54",
    },
  },
  {
    id: "claude",
    name: "Claude Dark",
    swatch: "#1a1410",
    palette: {
      bg: "#1a1410", card: "#211c16", secondary: "#2c2518", border: "rgba(217,119,6,0.16)",
      fg: "#f5e6d3", fgSub: "#a08a70", fgBright: "#d97706", fgBrightFg: "#1a1410", placeholder: "#6a5840",
    },
  },
  {
    id: "retro82",
    name: "Retro '82",
    swatch: "#1a0a2e",
    palette: {
      bg: "#1a0a2e", card: "#22103a", secondary: "#2a1548", border: "rgba(255,42,109,0.18)",
      fg: "#e0d0ff", fgSub: "#8a78a8", fgBright: "#ff2a6d", fgBrightFg: "#ffffff", placeholder: "#5a4878",
    },
  },
  // ── Light themes ──────────────────────────────────────────────────────────
  {
    id: "github-light",
    name: "GitHub",
    light: true,
    swatch: "#ffffff",
    palette: {
      bg: "#ffffff", card: "#f6f8fa", secondary: "#eaeef2", border: "rgba(31,35,40,0.12)",
      fg: "#1f2328", fgSub: "#656d76", fgBright: "#0969da", fgBrightFg: "#ffffff", placeholder: "#8c959f",
    },
  },
  {
    id: "material-light",
    name: "Material",
    light: true,
    swatch: "#fafafa",
    palette: {
      bg: "#fafafa", card: "#f2f2f2", secondary: "#eceff1", border: "rgba(55,71,79,0.10)",
      fg: "#37474f", fgSub: "#90a4ae", fgBright: "#e91e63", fgBrightFg: "#ffffff", placeholder: "#b0bec5",
    },
  },
  {
    id: "winter-light",
    name: "Winter",
    light: true,
    swatch: "#f2f6fc",
    palette: {
      bg: "#ffffff", card: "#f2f6fc", secondary: "#e8eef8", border: "rgba(45,84,160,0.12)",
      fg: "#2e3440", fgSub: "#6a7590", fgBright: "#2d54a0", fgBrightFg: "#ffffff", placeholder: "#9aa5ce",
    },
  },
  {
    id: "min-light",
    name: "Min",
    light: true,
    swatch: "#f5f5f5",
    palette: {
      bg: "#ffffff", card: "#f5f5f5", secondary: "#eeeeee", border: "rgba(0,0,0,0.10)",
      fg: "#1a1a1a", fgSub: "#888888", fgBright: "#1a1a1a", fgBrightFg: "#ffffff", placeholder: "#aaaaaa",
    },
  },
  {
    id: "ivory",
    name: "Ivory",
    light: true,
    swatch: "#faf8f5",
    palette: {
      bg: "#faf8f5", card: "#f5f0eb", secondary: "#e7e2db", border: "rgba(0,0,0,0.10)",
      fg: "#1c1917", fgSub: "#78716c", fgBright: "#292524", fgBrightFg: "#faf8f5", placeholder: "#a8a29e",
    },
  },
  {
    id: "rosewood",
    name: "Rosewood",
    light: true,
    swatch: "#fff8f0",
    palette: {
      bg: "#fff8f0", card: "#f5ede5", secondary: "#efebe7", border: "rgba(62,39,35,0.10)",
      fg: "#3e2723", fgSub: "#8d6e63", fgBright: "#c0392b", fgBrightFg: "#ffffff", placeholder: "#a1887f",
    },
  },
  {
    id: "powershell",
    name: "PowerShell",
    light: true,
    swatch: "#eeeef2",
    palette: {
      bg: "#ffffff", card: "#f3f3f6", secondary: "#eeeef2", border: "rgba(1,36,86,0.10)",
      fg: "#1e1e1e", fgSub: "#6e6e8a", fgBright: "#012456", fgBrightFg: "#ffffff", placeholder: "#9898b0",
    },
  },
]

// ── Mutable global colors ─────────────────────────────────────────────────────
// Components import `c` directly. When the theme changes, we mutate `c` in
// place and bump a context version so the tree re-renders with fresh values.

const defaultPalette = themes[0].palette

export const c = {
  // Base — mutated in place by applyTheme()
  bg: defaultPalette.bg,
  card: defaultPalette.card,
  secondary: defaultPalette.secondary,
  border: defaultPalette.border,
  fg: defaultPalette.fg,
  fgSub: defaultPalette.fgSub,
  fgBright: defaultPalette.fgBright,
  fgBrightFg: defaultPalette.fgBrightFg,
  placeholder: defaultPalette.placeholder,

  // Semantic — constant across themes
  success: diffColors.addition,
  error: diffColors.deletion,
  warning: statusColors["in-progress"].color,
  link: statusColors["in-review"].color,
  addBg: diffColors.additionBg,
  delBg: diffColors.deletionBg,
  merged: prColors.merged,
} as Record<string, string>

export function applyTheme(id: string) {
  const theme = themes.find((t) => t.id === id) ?? themes[0]
  Object.assign(c, theme.palette)
}

// Context — provider lives in _layout.tsx, components re-render when version bumps
export const ThemeContext = createContext({ themeId: "stone", setThemeId: (_id: string) => {} })
export function useTheme() { return useContext(ThemeContext) }
