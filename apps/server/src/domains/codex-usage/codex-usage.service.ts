import { z } from "zod"
import type { CodexUsage } from "@huxflux/shared"
import { getProvider } from "../providers/registry.js"
import { readRateLimits } from "./service/readRateLimits.js"

const windowSchema = z.object({
  usedPercent: z.number().finite().min(0).max(100),
  windowDurationMins: z.number().positive().nullish(),
  resetsAt: z.number().finite().min(0).max(8_640_000_000_000),
})
const limitsSchema = z.object({
  primary: windowSchema.nullish(),
  secondary: windowSchema.nullish(),
})
const responseSchema = z.object({
  rateLimits: limitsSchema.nullish(),
  rateLimitsByLimitId: z.record(limitsSchema).nullish(),
})

export function mapCodexUsage(raw: unknown): CodexUsage {
  const parsed = responseSchema.parse(raw)
  const limits = parsed.rateLimitsByLimitId?.codex ?? parsed.rateLimits
  const windows = [limits?.primary, limits?.secondary].filter((w) => w != null)
  const session = windows.find((w) => w.windowDurationMins != null && w.windowDurationMins < 1440)
  const weekly = windows.find((w) => w.windowDurationMins === 10080)
  const normalize = (window: typeof session) => window ? {
    utilization: window.usedPercent,
    resetsAt: new Date(window.resetsAt * 1000).toISOString(),
  } : null
  return { connected: true, session: normalize(session), weekly: normalize(weekly), spend: null, reason: null, error: null }
}

let cached: { at: number; usage: CodexUsage } | null = null
let pending: Promise<CodexUsage> | null = null

export function fetchCodexUsage(): Promise<CodexUsage> {
  if (cached && Date.now() - cached.at < 60_000) return Promise.resolve(cached.usage)
  if (pending) return pending
  pending = readRateLimits(getProvider("codex").resolveBinary())
    .then(mapCodexUsage)
    .catch((): CodexUsage => ({
      connected: false, session: null, weekly: null, spend: null,
      reason: "unavailable", error: "Codex usage unavailable; check that Codex is installed and signed in",
    }))
    .then((usage) => {
      cached = { at: Date.now(), usage }
      return usage
    })
    .finally(() => { pending = null })
  return pending
}
