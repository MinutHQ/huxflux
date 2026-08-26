// Cross-platform Zod schema for the Claude.ai plan-usage surface.
//
// The server reads the local Claude Code OAuth token, calls Anthropic's
// `/api/oauth/usage` endpoint, and normalizes the response down to the two
// windows the sidebar cares about: the 5-hour rolling session window and the
// 7-day weekly window. `utilization` is a 0–100 percentage; `resetsAt` is an
// ISO timestamp for when that window rolls over.
//
// Alongside the windows, `spend` carries the usage-credit total Anthropic
// reports once an account has overspent its plan limits (what `/usage` shows
// as a currency amount). It is a raw money value, not a percentage: accounts
// without a spend cap have no bar to draw, only an amount.

import { z } from "zod/v4"

export const claudeUsageWindowSchema = z.object({
  utilization: z.number(),
  resetsAt: z.string(),
})

// How much the credit total moved over each trailing window, in the same minor
// units as the total itself. Upstream reports no history, so the server derives
// these from its own log of past readings. A window is null when no reading
// reaches back that far — the sidebar must render that as "unknown", never as
// zero change.
export const claudeUsageSpendDeltasSchema = z.object({
  hour: z.number().nullable(),
  day: z.number().nullable(),
  week: z.number().nullable(),
})

// Money as Anthropic reports it: an integer in the currency's minor unit plus
// the exponent needed to scale it back (34654 / 10^2 = 346.54). Kept in minor
// units so no float rounding happens between the API and the render.
export const claudeUsageSpendSchema = z.object({
  amountMinor: z.number(),
  currency: z.string(),
  exponent: z.number(),
  deltas: claudeUsageSpendDeltasSchema,
})

// Why a reading is unavailable, as a value the client can branch on. The
// human-readable `error` string carries the detail, but copy and layout
// decisions should never be made by pattern-matching prose.
export const claudeUsageReasonSchema = z.enum([
  // No OAuth token: not signed in. The feature does not apply, as opposed to
  // being broken, so the sidebar renders nothing at all for this one.
  "no-token",
  // Upstream returned 429. Transient; the next poll may well succeed.
  "rate-limited",
  // Upstream returned 401/403. The token is bad and needs re-authentication.
  "auth",
  // Anything else: timeout, network error, 5xx.
  "unavailable",
])

export const claudeUsageSchema = z.object({
  // false when no OAuth token could be resolved, on an auth failure, or on a
  // request failure with no cached reading to fall back to.
  connected: z.boolean(),
  // The 5-hour rolling session window (Anthropic's `five_hour`).
  session: claudeUsageWindowSchema.nullable(),
  // The 7-day weekly window (Anthropic's `seven_day`).
  weekly: claudeUsageWindowSchema.nullable(),
  // Usage credits spent beyond the plan limits. Null when the upstream
  // response carries no well-formed spend total.
  spend: claudeUsageSpendSchema.nullable(),
  // Why the reading is unavailable; null when connected.
  reason: claudeUsageReasonSchema.nullable(),
  // Human-readable detail when `connected` is false; null on success.
  error: z.string().nullable(),
})

export type ClaudeUsageWindow = z.infer<typeof claudeUsageWindowSchema>
export type ClaudeUsageSpend = z.infer<typeof claudeUsageSpendSchema>
export type ClaudeUsageSpendDeltas = z.infer<typeof claudeUsageSpendDeltasSchema>
export type ClaudeUsageReason = z.infer<typeof claudeUsageReasonSchema>
export type ClaudeUsage = z.infer<typeof claudeUsageSchema>
