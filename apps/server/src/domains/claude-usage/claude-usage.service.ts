import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"

import type { ClaudeUsage, ClaudeUsageSpend, ClaudeUsageWindow } from "@huxflux/shared"
import { logger } from "../../logger.js"
import { recordSpendSample, spendDeltas } from "./service/spendHistory.js"
import { clearCache, isFresh, readCache, writeCache, _resetMemo } from "./service/usageCache.js"

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
// The credit-spend total, reported as an integer in the currency's minor unit
// plus the exponent needed to scale it back (34654 / 10^2 = 346.54).
interface RawSpendAmount {
  amount_minor?: number | null
  currency?: string | null
  exponent?: number | null
}
interface RawSpend {
  used?: RawSpendAmount | null
}
interface RawUsageResponse {
  five_hour?: RawUsageWindow | null
  seven_day?: RawUsageWindow | null
  spend?: RawSpend | null
}

const disconnected = (error: string): ClaudeUsage => ({
  connected: false,
  session: null,
  weekly: null,
  spend: null,
  error,
})

// Deltas need the sample history, which lives behind the database. The pure
// mapper can't reach it, so it emits an empty set and `fetchClaudeUsage` fills
// them in once the reading has been recorded.
const noDeltas = { hour: null, day: null, week: null }

function toWindow(raw: RawUsageWindow | null | undefined): ClaudeUsageWindow | null {
  if (!raw || typeof raw.utilization !== "number" || typeof raw.resets_at !== "string") {
    return null
  }
  return { utilization: raw.utilization, resetsAt: raw.resets_at }
}

function toSpend(raw: RawSpend | null | undefined): ClaudeUsageSpend | null {
  const used = raw?.used
  if (
    !used ||
    typeof used.amount_minor !== "number" ||
    typeof used.currency !== "string" ||
    typeof used.exponent !== "number"
  ) {
    return null
  }
  return {
    amountMinor: used.amount_minor,
    currency: used.currency,
    exponent: used.exponent,
    deltas: { ...noDeltas },
  }
}

// Test-only: reset the cached reading so cases don't leak state into each other.
export function _resetUsageCache(): void {
  _resetMemo()
}

// Pure mapping from the upstream payload to our normalized shape. Exported so
// it can be tested against a recorded response without touching the network.
export function mapUsageResponse(raw: RawUsageResponse): ClaudeUsage {
  return {
    connected: true,
    session: toWindow(raw.five_hour),
    weekly: toWindow(raw.seven_day),
    spend: toSpend(raw.spend),
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

export async function fetchClaudeUsage(now: number = Date.now()): Promise<ClaudeUsage> {
  const token = await resolveAccessToken()
  if (!token) {
    // No account signed in — genuinely disconnected. Drop any stale reading so
    // we don't keep showing usage for an account that's no longer present.
    clearCache()
    return disconnected("No Claude OAuth token found (sign in to a Claude subscription account)")
  }

  // Serve a recent reading without going upstream. Every open client polls once
  // a minute, so without this the upstream call rate scales with the number of
  // clients and the account starts collecting 429s.
  const cached = readCache()
  if (cached && isFresh(cached, now)) return cached.usage

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
        clearCache()
        return disconnected(`Usage request failed (${res.status})`)
      }
      return cached?.usage ?? disconnected(`Usage request failed (${res.status})`)
    }
    const usage = mapUsageResponse((await res.json()) as RawUsageResponse)
    // Log this reading before diffing against it, so the history always
    // contains the number we are about to report.
    if (usage.spend) {
      recordSpendSample(usage.spend, now)
      usage.spend.deltas = spendDeltas(usage.spend, now)
    }
    writeCache(usage, now)
    return usage
  } catch (err) {
    logger.warn({ err }, "[claude-usage] failed to fetch usage")
    // A transient failure (timeout, 429, 5xx, network) falls back to the last
    // good reading at whatever age, since a token is still present and the
    // account is therefore still connected. That reading now outlives a
    // restart, so a server that comes up into a rate limit still has numbers.
    return cached?.usage ?? disconnected(err instanceof Error ? err.message : "Unknown error")
  } finally {
    clearTimeout(timer)
  }
}
