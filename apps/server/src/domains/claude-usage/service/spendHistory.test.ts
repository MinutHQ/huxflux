import { describe, it, expect, beforeEach, afterEach } from "vitest"

import type { ClaudeUsageSpend } from "@huxflux/shared"
import { createTestDb, type TestDb } from "../../../../test/harness.js"
import { db } from "../../../db/index.js"
import { claudeUsageSamples } from "../claude-usage.db.js"
import { deltaFrom, recordSpendSample, spendDeltas } from "./spendHistory.js"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

// A fixed "now" so window arithmetic in the assertions is readable.
const NOW = 1_800_000_000_000

function spend(amountMinor: number, currency = "EUR"): ClaudeUsageSpend {
  return { amountMinor, currency, exponent: 2, deltas: { hour: null, day: null, week: null } }
}

function seed(recordedAt: number, amountMinor: number, currency = "EUR") {
  db.insert(claudeUsageSamples).values({ recordedAt, amountMinor, currency, exponent: 2 }).run()
}

function allSamples(): { recordedAt: number, amountMinor: number }[] {
  return db
    .select({ recordedAt: claudeUsageSamples.recordedAt, amountMinor: claudeUsageSamples.amountMinor })
    .from(claudeUsageSamples)
    .all() as { recordedAt: number, amountMinor: number }[]
}

describe("deltaFrom", () => {
  it("subtracts the baseline from the current total", () => {
    expect(deltaFrom(34654, 34400)).toBe(254)
  })

  it("reports null when there is no baseline", () => {
    expect(deltaFrom(34654, null)).toBeNull()
  })

  it("reports zero when the total has not moved", () => {
    expect(deltaFrom(34654, 34654)).toBe(0)
  })

  it("treats a drop as a billing-cycle reset and reports the whole current total", () => {
    // The total never decreases within a cycle, so 500 after a baseline of
    // 34654 means the meter restarted — all 500 accrued inside the window.
    expect(deltaFrom(500, 34654)).toBe(500)
  })

  it("reports zero rather than a negative when the reset total is zero", () => {
    expect(deltaFrom(0, 34654)).toBe(0)
  })
})

describe("recordSpendSample", () => {
  let testDb: TestDb
  beforeEach(() => { testDb = createTestDb() })
  afterEach(() => { testDb.close() })

  it("writes the first reading", () => {
    recordSpendSample(spend(34654), NOW)
    expect(allSamples()).toEqual([{ recordedAt: NOW, amountMinor: 34654 }])
  })

  it("skips a repeat reading inside the heartbeat interval", () => {
    recordSpendSample(spend(34654), NOW)
    recordSpendSample(spend(34654), NOW + 60_000)
    expect(allSamples()).toHaveLength(1)
  })

  it("writes when the total changes, however soon", () => {
    recordSpendSample(spend(34654), NOW)
    recordSpendSample(spend(34700), NOW + 1_000)
    expect(allSamples()).toHaveLength(2)
  })

  it("writes a heartbeat once the newest sample goes stale", () => {
    recordSpendSample(spend(34654), NOW)
    recordSpendSample(spend(34654), NOW + 16 * 60_000)
    expect(allSamples()).toHaveLength(2)
  })

  it("writes when the currency changes even at the same amount", () => {
    recordSpendSample(spend(34654, "EUR"), NOW)
    recordSpendSample(spend(34654, "USD"), NOW + 60_000)
    expect(allSamples()).toHaveLength(2)
  })

  it("prunes samples beyond the retention horizon", () => {
    seed(NOW - 31 * DAY_MS, 100)
    seed(NOW - 2 * DAY_MS, 200)
    recordSpendSample(spend(34654), NOW)

    const remaining = allSamples().map((s) => s.amountMinor)
    expect(remaining).toEqual([200, 34654])
  })
})

describe("spendDeltas", () => {
  let testDb: TestDb
  beforeEach(() => { testDb = createTestDb() })
  afterEach(() => { testDb.close() })

  it("diffs each window against the newest sample at or before its boundary", () => {
    seed(NOW - WEEK_MS - HOUR_MS, 10_000)
    seed(NOW - DAY_MS - HOUR_MS, 30_000)
    seed(NOW - 2 * HOUR_MS, 34_000)

    expect(spendDeltas(spend(34_654), NOW)).toEqual({
      hour: 34_654 - 34_000,
      day: 34_654 - 30_000,
      week: 34_654 - 10_000,
    })
  })

  it("reports null for a window no sample reaches back to", () => {
    // Only ten minutes of history: the hour boundary has nothing at or before it.
    seed(NOW - 10 * 60_000, 34_000)

    expect(spendDeltas(spend(34_654), NOW)).toEqual({ hour: null, day: null, week: null })
  })

  it("fills windows in as history accumulates", () => {
    seed(NOW - 2 * HOUR_MS, 34_000)

    const deltas = spendDeltas(spend(34_654), NOW)
    expect(deltas.hour).toBe(654)
    expect(deltas.day).toBeNull()
    expect(deltas.week).toBeNull()
  })

  it("ignores samples recorded in a different currency", () => {
    seed(NOW - 2 * HOUR_MS, 34_000, "USD")

    expect(spendDeltas(spend(34_654, "EUR"), NOW).hour).toBeNull()
  })

  it("clamps to the current total when the cycle reset inside the window", () => {
    seed(NOW - 2 * HOUR_MS, 34_000)

    // Meter restarted: 500 now, against a baseline of 34000.
    expect(spendDeltas(spend(500), NOW).hour).toBe(500)
  })
})
