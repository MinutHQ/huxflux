import * as fs from "node:fs"
import * as path from "node:path"
import { DATA_DIR } from "./config.js"

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json")

export interface HuxfluxSettings {
  reviewPrompt?: string
  defaultModel?: string
}

export function getSettings(): HuxfluxSettings {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as HuxfluxSettings
  } catch {
    return {}
  }
}

export function saveSettings(settings: HuxfluxSettings): void {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }) } catch { /* exists */ }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}
