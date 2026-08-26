import { and, desc, eq, lte, lt } from "drizzle-orm"

import type { ClaudeUsageSpend, ClaudeUsageSpendDeltas } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { claudeUsageSamples } from "../claude-usage.db.js"

// Anthropic's usage endpoint reports the credit spend as a running total and
// nothing else — no history, no per-period breakdown. To answer "how much did
// this move in the last hour/day/week" we keep our own rolling log of what the
// endpoint said and diff against it.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

// Heartbeat: write a sample even when the total is unchanged, so a window
// boundary always has a row at or before it once the app has been open that
// long. Without it, a quiet day would leave the hourly baseline days old.
const HEARTBEAT_MS = 15 * 60 * 1000

// Samples older than this are dropped. Nothing reads past the week window, so
// a month of slack is plenty for debugging while keeping the table trivial.
const RETENTION_MS = 30 * DAY_MS

/**
 * Diff a current total against a historical baseline.
 *
 * Anthropic resets the credit total at the start of each billing cycle, so a
 * naive subtraction can go negative. A drop is only explicable as a reset (the
 * total never decreases within a cycle), so we treat everything currently on
 * the meter as having accrued inside the window rather than reporting a
 * negative. That can overstate a short window right after a reset, which beats
 * rendering a minus sign nobody can interpret.
 *
 * Returns null when there is no baseline — the caller has no history reaching
 * back that far and must not claim a change of zero.
 */
export function deltaFrom(currentMinor: number, baselineMinor: number | null): number | null {
  if (baselineMinor === null) return null
  const delta = currentMinor - baselineMinor
  return delta < 0 ? currentMinor : delta
}

/** Newest sample recorded at or before `at`, in the same currency. */
function baselineAt(currency: string, at: number): number | null {
  const row = db
    .select({ amountMinor: claudeUsageSamples.amountMinor })
    .from(claudeUsageSamples)
    .where(and(eq(claudeUsageSamples.currency, currency), lte(claudeUsageSamples.recordedAt, at)))
    .orderBy(desc(claudeUsageSamples.recordedAt))
    .limit(1)
    .get() as { amountMinor: number } | undefined
  return row?.amountMinor ?? null
}

/** Newest sample of any age, used to decide whether a new row is worth writing. */
function newestSample(): { recordedAt: number, amountMinor: number, currency: string } | null {
  const row = db
    .select({
      recordedAt: claudeUsageSamples.recordedAt,
      amountMinor: claudeUsageSamples.amountMinor,
      currency: claudeUsageSamples.currency,
    })
    .from(claudeUsageSamples)
    .orderBy(desc(claudeUsageSamples.recordedAt))
    .limit(1)
    .get() as { recordedAt: number, amountMinor: number, currency: string } | undefined
  return row ?? null
}

/**
 * Append a sample if it carries new information: the first ever reading, a
 * changed total, a changed currency, or a heartbeat once the newest row goes
 * stale. Every client poll calls this (once a minute per open client), so the
 * guard is what keeps the table from growing without bound.
 */
export function recordSpendSample(spend: ClaudeUsageSpend, now: number = Date.now()): void {
  const newest = newestSample()
  const unchanged =
    newest !== null &&
    newest.amountMinor === spend.amountMinor &&
    newest.currency === spend.currency &&
    now - newest.recordedAt < HEARTBEAT_MS
  if (unchanged) return

  db.insert(claudeUsageSamples).values({
    recordedAt: now,
    amountMinor: spend.amountMinor,
    currency: spend.currency,
    exponent: spend.exponent,
  }).run()

  db.delete(claudeUsageSamples).where(lt(claudeUsageSamples.recordedAt, now - RETENTION_MS)).run()
}

/**
 * How much the credit total moved over each window, in minor units. A window
 * is null when no sample reaches back that far — a fresh install reports null
 * for all three, and each fills in as history accumulates.
 */
export function spendDeltas(spend: ClaudeUsageSpend, now: number = Date.now()): ClaudeUsageSpendDeltas {
  return {
    hour: deltaFrom(spend.amountMinor, baselineAt(spend.currency, now - HOUR_MS)),
    day: deltaFrom(spend.amountMinor, baselineAt(spend.currency, now - DAY_MS)),
    week: deltaFrom(spend.amountMinor, baselineAt(spend.currency, now - WEEK_MS)),
  }
}
