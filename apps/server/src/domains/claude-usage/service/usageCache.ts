import { eq } from "drizzle-orm"

import { claudeUsageSchema, type ClaudeUsage } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { logger } from "../../../logger.js"
import { claudeUsageCache } from "../claude-usage.db.js"

// How long a successful reading is served without going upstream again. The
// sidebar polls every 60s per open client, and Anthropic's usage endpoint is
// rate-limited, so without this every extra client or tab multiplies the
// upstream call rate until the account starts getting 429s.
export const FRESH_MS = 60_000

const ROW_ID = 1

export interface CachedUsage {
  fetchedAt: number
  usage: ClaudeUsage
}

// Mirror of the stored row. Reading a row and parsing its JSON on every request
// would be wasteful when the whole point is to answer quickly; the database
// copy exists so the reading survives a restart, not to be hit in a hot path.
let memo: CachedUsage | null = null
let loaded = false

/** The last good reading, whatever its age, or null if there has never been one. */
export function readCache(): CachedUsage | null {
  if (loaded) return memo
  loaded = true
  try {
    const row = db
      .select({ fetchedAt: claudeUsageCache.fetchedAt, payload: claudeUsageCache.payload })
      .from(claudeUsageCache)
      .where(eq(claudeUsageCache.id, ROW_ID))
      .get() as { fetchedAt: number, payload: string } | undefined
    if (!row) return null
    // A payload written by an older build can predate a schema change. Parsing
    // it here means a drifted row is dropped rather than served as a shape the
    // client will reject.
    const parsed = claudeUsageSchema.safeParse(JSON.parse(row.payload))
    if (!parsed.success) return null
    memo = { fetchedAt: row.fetchedAt, usage: parsed.data }
    return memo
  } catch (err) {
    logger.warn({ err }, "[claude-usage] failed to read cached usage")
    return null
  }
}

/** True when the cached reading is recent enough to serve without refetching. */
export function isFresh(cached: CachedUsage, now: number): boolean {
  return now - cached.fetchedAt < FRESH_MS
}

export function writeCache(usage: ClaudeUsage, now: number): void {
  memo = { fetchedAt: now, usage }
  loaded = true
  try {
    db.insert(claudeUsageCache)
      .values({ id: ROW_ID, fetchedAt: now, payload: JSON.stringify(usage) })
      .onConflictDoUpdate({
        target: claudeUsageCache.id,
        set: { fetchedAt: now, payload: JSON.stringify(usage) },
      })
      .run()
  } catch (err) {
    // A failed write costs freshness across restarts, not correctness — the
    // in-memory copy still serves this process.
    logger.warn({ err }, "[claude-usage] failed to persist cached usage")
  }
}

/**
 * Forget the cached reading entirely. Used on sign-out and on an auth failure,
 * where continuing to show numbers for an account that can no longer
 * authenticate would be worse than showing nothing.
 */
export function clearCache(): void {
  memo = null
  loaded = true
  try {
    db.delete(claudeUsageCache).where(eq(claudeUsageCache.id, ROW_ID)).run()
  } catch (err) {
    logger.warn({ err }, "[claude-usage] failed to clear cached usage")
  }
}

/** Test-only: drop the in-memory copy so the next read goes back to the database. */
export function _resetMemo(): void {
  memo = null
  loaded = false
}
