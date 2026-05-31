import * as fs from "node:fs"
import * as path from "node:path"
import { settingsDefaults } from "@huxflux/shared/settings-schema"
import { DATA_DIR } from "../../config.js"
import type { HuxfluxSettings } from "./settings.types.js"

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json")

/**
 * Read the persisted settings blob and merge it under the schema defaults so
 * every consumer sees a fully-populated object. Missing or unreadable files
 * yield the pure defaults — consumers never have to `?? someFallback`.
 */
export function getSettings(): HuxfluxSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as HuxfluxSettings
    return { ...settingsDefaults, ...raw }
  } catch {
    return { ...settingsDefaults }
  }
}

export function saveSettings(settings: HuxfluxSettings): void {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }) } catch { /* exists */ }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}
