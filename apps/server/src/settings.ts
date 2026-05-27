import * as fs from "node:fs"
import * as path from "node:path"
import { DATA_DIR } from "./config.js"

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json")

export interface HuxfluxSettings {
  reviewPrompt?: string
  reviewModel?: string
  reviewProvider?: string
  defaultModel?: string
  defaultProvider?: string
  killProcessesOnDone?: boolean
  prCommentMonitoring?: boolean  // Send new PR comments to agents (default: true)
  ciMonitoring?: boolean         // Notify agents of CI failures (default: true)
  pollingIntervalMs?: number     // How often to poll for PR/CI updates (default: 60000)
  threadsEnabled?: boolean         // Enable thread agents (experimental)
  autoUpdateServer?: boolean  // Auto-update server when idle (default: false)
  jiraBaseUrl?: string    // e.g. "https://mycompany.atlassian.net"
  jiraEmail?: string      // e.g. "user@company.com"
  jiraApiToken?: string   // API token from id.atlassian.com
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
