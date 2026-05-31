import { eq } from "drizzle-orm"
import type { FastifyBaseLogger } from "fastify"
import { db } from "../../../db/index.js"
import { wrappedSummaries } from "../../../db/schema.js"
import type { DateRange, Length } from "../wrapped.types.js"
import { gatherStats } from "./stats.js"
import { buildPrompt, buildStatsForPrompt } from "./prompt.js"
import { generateSummary, upsertSummary } from "./summary.js"

export interface GenerateResult {
  summary: string
  periodKey: string
  cached: boolean
}

/**
 * End-to-end: try the cache (unless `refresh`), gather stats, short-circuit
 * on empty periods, otherwise build the prompt and call Claude. Caching
 * happens here so the route handler stays a thin parser + dispatcher.
 */
export async function generateWrappedSummary(
  range: DateRange,
  length: Length,
  refresh: boolean,
  log: FastifyBaseLogger,
): Promise<GenerateResult> {
  if (!refresh) {
    const cached = db.select().from(wrappedSummaries)
      .where(eq(wrappedSummaries.periodKey, range.periodKey))
      .get()
    if (cached) {
      return { summary: cached.summary, periodKey: cached.periodKey, cached: true }
    }
  }

  const stats = gatherStats(range)

  // If no activity, return a simple message without calling Claude
  if (stats.totalAgents === 0 && stats.totalMessages === 0) {
    const summary = "No agent activity in this period."
    upsertSummary(range.periodKey, summary, "{}")
    return { summary, periodKey: range.periodKey, cached: false }
  }

  const statsForPrompt = buildStatsForPrompt(range, stats)
  const prompt = buildPrompt(statsForPrompt, stats, length)

  let summary: string
  try {
    summary = await generateSummary(prompt)
  } catch (err) {
    log.error({ err, periodKey: range.periodKey }, "wrapped: summary generation failed")
    throw new Error(`Summary generation failed: ${(err as Error).message}`)
  }

  upsertSummary(range.periodKey, summary, JSON.stringify(statsForPrompt))
  return { summary, periodKey: range.periodKey, cached: false }
}
