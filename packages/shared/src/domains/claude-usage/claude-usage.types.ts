// Cross-platform Zod schema for the Claude.ai plan-usage surface.
//
// The server reads the local Claude Code OAuth token, calls Anthropic's
// `/api/oauth/usage` endpoint, and normalizes the response down to the two
// windows the sidebar cares about: the 5-hour rolling session window and the
// 7-day weekly window. `utilization` is a 0–100 percentage; `resetsAt` is an
// ISO timestamp for when that window rolls over.

import { z } from "zod/v4"

export const claudeUsageWindowSchema = z.object({
  utilization: z.number(),
  resetsAt: z.string(),
})

export const claudeUsageSchema = z.object({
  // false when no OAuth token could be resolved or the request failed.
  connected: z.boolean(),
  // The 5-hour rolling session window (Anthropic's `five_hour`).
  session: claudeUsageWindowSchema.nullable(),
  // The 7-day weekly window (Anthropic's `seven_day`).
  weekly: claudeUsageWindowSchema.nullable(),
  // Human-readable reason when `connected` is false; null on success.
  error: z.string().nullable(),
})

export type ClaudeUsageWindow = z.infer<typeof claudeUsageWindowSchema>
export type ClaudeUsage = z.infer<typeof claudeUsageSchema>
