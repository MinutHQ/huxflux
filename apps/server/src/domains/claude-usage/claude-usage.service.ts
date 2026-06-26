import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"

import type { ClaudeUsage, ClaudeUsageWindow } from "@huxflux/shared"
import { logger } from "../../logger.js"

const execFileAsync = promisify(execFile)

const BETA_HEADER = "oauth-2025-04-20"
const KEYCHAIN_SERVICE = "Claude Code-credentials"

// Shape of the slice of Anthropic's /api/oauth/usage response we consume.
// Everything is optional because the upstream payload carries many fields we
// ignore and may omit a window entirely.
interface RawUsageWindow {
  utilization?: number | null
  resets_at?: string | null
}
interface RawUsageResponse {
  five_hour?: RawUsageWindow | null
  seven_day?: RawUsageWindow | null
}

const disconnected = (error: string): ClaudeUsage => ({
  connected: false,
  session: null,
  weekly: null,
  error,
})

function toWindow(raw: RawUsageWindow | null | undefined): ClaudeUsageWindow | null {
  if (!raw || typeof raw.utilization !== "number" || typeof raw.resets_at !== "string") {
    return null
  }
  return { utilization: raw.utilization, resetsAt: raw.resets_at }
}

// Last successful usage reading. Anthropic's usage endpoint is occasionally
// slow (we abort at 5s) or rate-limited; rather than collapsing the sidebar to
// "disconnected" on a single transient failure, we keep serving the last good
// reading as long as a token is still present. Cleared when the token vanishes
// (sign-out) or on process restart.
let lastGood: ClaudeUsage | null = null

// Test-only: reset the cached reading so cases don't leak state into each other.
export function _resetUsageCache(): void {
  lastGood = null
}

// Pure mapping from the upstream payload to our normalized shape. Exported so
// it can be tested against a recorded response without touching the network.
export function mapUsageResponse(raw: RawUsageResponse): ClaudeUsage {
  return {
    connected: true,
    session: toWindow(raw.five_hour),
    weekly: toWindow(raw.seven_day),
    error: null,
  }
}

// Resolve the Claude Code OAuth access token the same way the official CLI
// does: env var first, then the macOS keychain, then the plaintext
// credentials file. Returns null when none is available.
async function resolveAccessToken(): Promise<string | null> {
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()
  if (envToken) return envToken

  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-a",
        os.userInfo().username,
        "-w",
        "-s",
        KEYCHAIN_SERVICE,
      ])
      // `-w` prints the raw secret; the Claude CLI stores it as a JSON string,
      // so parse it to pull out the access token.
      const token = JSON.parse(stdout.trim())?.claudeAiOauth?.accessToken
      if (typeof token === "string" && token) return token
    } catch {
      // Fall through to the plaintext credentials file.
    }
  }

  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude")
  try {
    const raw = await readFile(path.join(configDir, ".credentials.json"), "utf8")
    const token = JSON.parse(raw)?.claudeAiOauth?.accessToken
    return typeof token === "string" && token ? token : null
  } catch {
    return null
  }
}

export async function fetchClaudeUsage(): Promise<ClaudeUsage> {
  const token = await resolveAccessToken()
  if (!token) {
    // No account signed in — genuinely disconnected. Drop any stale reading so
    // we don't keep showing usage for an account that's no longer present.
    lastGood = null
    return disconnected("No Claude OAuth token found (sign in to a Claude subscription account)")
  }

  const baseUrl = process.env.ANTHROPIC_BASE_API_URL?.trim() || "https://api.anthropic.com"
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(`${baseUrl}/api/oauth/usage`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "anthropic-beta": BETA_HEADER,
        "User-Agent": "huxflux",
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      // A 401/403 means the token itself is bad (expired/revoked), not a
      // transient blip. Drop the cache and report disconnected so stale bars
      // don't linger for an account that can no longer authenticate. Other
      // statuses (429, 5xx) are transient — fall back to the last good reading.
      if (res.status === 401 || res.status === 403) {
        lastGood = null
        return disconnected(`Usage request failed (${res.status})`)
      }
      return staleOr(disconnected(`Usage request failed (${res.status})`))
    }
    const usage = mapUsageResponse((await res.json()) as RawUsageResponse)
    lastGood = usage
    return usage
  } catch (err) {
    logger.warn({ err }, "[claude-usage] failed to fetch usage")
    return staleOr(disconnected(err instanceof Error ? err.message : "Unknown error"))
  } finally {
    clearTimeout(timer)
  }
}

// On a transient fetch failure, prefer the last good reading (a token is still
// present, so the account is connected) over collapsing to disconnected.
function staleOr(fallback: ClaudeUsage): ClaudeUsage {
  return lastGood ?? fallback
}
