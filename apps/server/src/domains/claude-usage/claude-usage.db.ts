import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

// Drizzle table definitions owned by the claude-usage domain. The centralized
// migration history lives in src/db/index.ts; this file is the source-of-truth
// shape and is re-exported by `src/db/schema.ts` for the backward-compatible
// barrel.

// Rolling history of the usage-credit total Anthropic reports. The upstream
// endpoint only ever returns a running total, so the only way to answer "how
// much did this change in the last hour" is to remember what it said before.
// One row per observed change (plus a periodic heartbeat), written whenever a
// client polls `/api/claude/usage`.
export const claudeUsageSamples = sqliteTable("claude_usage_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Epoch milliseconds. Numeric so window lookups are plain integer compares. */
  recordedAt: integer("recorded_at").notNull(),
  /** Credit total in the currency's minor unit (e.g. cents). */
  amountMinor: integer("amount_minor").notNull(),
  /** ISO 4217 code. A change of currency invalidates older baselines. */
  currency: text("currency").notNull(),
  /** Decimal places needed to scale `amountMinor` back to a major amount. */
  exponent: integer("exponent").notNull(),
})

// The most recent successful reading, kept as one row. Two jobs: it lets N
// polling clients share a single upstream call inside the freshness window,
// and it survives a restart, so a rate-limited server can still show the last
// known numbers instead of collapsing the sidebar to nothing.
export const claudeUsageCache = sqliteTable("claude_usage_cache", {
  /** Always 1. The table holds exactly one row, enforced by a CHECK. */
  id: integer("id").primaryKey(),
  /** Epoch milliseconds the reading was fetched. */
  fetchedAt: integer("fetched_at").notNull(),
  /** The `ClaudeUsage` snapshot, JSON-encoded. */
  payload: text("payload").notNull(),
})
