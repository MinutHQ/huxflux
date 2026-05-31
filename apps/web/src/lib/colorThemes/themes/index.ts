import type { ColorTheme } from "../types"
import { stone } from "./stone"
import { jarvis } from "./jarvis"
import { everforest } from "./everforest"
import { sakura } from "./sakura"
import { aether } from "./aether"
import { neoTokyo } from "./neoTokyo"
import { gruvbox } from "./gruvbox"
import { claude } from "./claude"
import { retro82 } from "./retro82"
import { githubLight } from "./githubLight"
import { materialLight } from "./materialLight"
import { winterLight } from "./winterLight"
import { minLight } from "./minLight"
import { ivory } from "./ivory"
import { rosewood } from "./rosewood"
import { powershell } from "./powershell"

// Order matters for the UI — dark themes first, then light themes.
export const colorThemes: ColorTheme[] = [
  stone,
  jarvis,
  everforest,
  sakura,
  aether,
  neoTokyo,
  gruvbox,
  claude,
  retro82,
  // ── Light themes ────────────────────────────────────────────────────────────
  githubLight,
  materialLight,
  winterLight,
  minLight,
  ivory,
  rosewood,
  powershell,
]
