import type { FastifyBaseLogger } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { getDateRange } from "./service/dateRange.js"
import { generateWrappedSummary } from "./service/generate.js"
import type { Length, Period } from "./wrapped.types.js"

const VALID_PERIODS: Period[] = ["wtd", "last-week", "last-month", "last-year", "custom"]
const VALID_LENGTHS: Length[] = ["short", "medium", "long"]

const wrappedQuerySchema = z.object({
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  refresh: z.string().optional(),
  length: z.string().optional(),
})

type WrappedQuery = z.infer<typeof wrappedQuerySchema>

/**
 * Fastify plugin for the wrapped domain. Exposes the single
 * `/api/wrapped` endpoint that produces a narrative recap of the recent
 * coding activity, cached per (period, length) cache key.
 */
export const wrappedPlugin: FastifyPluginAsyncZod = async (app) => {
  await app.register(wrappedRoutes)
}

const wrappedRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/wrapped", {
    schema: { querystring: wrappedQuerySchema },
  }, async (req, reply) => {
    try {
      return await runWrapped(req.query, req.log)
    } catch (err) {
      req.log.error({ err }, "wrapped: request failed")
      reply.code(500)
      return { error: (err as Error).message || "Internal error" }
    }
  })
}

async function runWrapped(query: WrappedQuery, log: FastifyBaseLogger): Promise<unknown> {
  const period = (query.period ?? "wtd") as Period
  if (!VALID_PERIODS.includes(period)) {
    throw new Error(`Invalid period: ${period}`)
  }

  const length: Length = VALID_LENGTHS.includes(query.length as Length)
    ? (query.length as Length)
    : "medium"

  const refresh = query.refresh === "true" || query.refresh === "1"
  const baseRange = getDateRange(period, query.from, query.to)
  // Scope cache key by length so each variant is cached independently
  const range = { ...baseRange, periodKey: `${baseRange.periodKey}-${length}` }

  return generateWrappedSummary(range, length, refresh, log)
}
