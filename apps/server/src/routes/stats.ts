import type { FastifyInstance } from "fastify"
import { count, sum, sql, isNull, isNotNull } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, fileChanges, repos } from "../db/schema.js"

export async function statsRoutes(app: FastifyInstance) {
  app.get("/api/stats", async () => {
    // Agents — include soft-deleted for lifetime count
    const allAgents = db.select({
      total: count(),
    }).from(agents).get()

    const activeAgents = db.select({
      total: count(),
    }).from(agents).where(isNull(agents.deletedAt)).get()

    const deletedAgents = db.select({
      total: count(),
    }).from(agents).where(isNotNull(agents.deletedAt)).get()

    // Messages
    const msgStats = db.select({
      total: count(),
      inputTokens: sum(messages.inputTokens),
      outputTokens: sum(messages.outputTokens),
      cacheReadTokens: sum(messages.cacheReadTokens),
      cacheWriteTokens: sum(messages.cacheWriteTokens),
    }).from(messages).get()

    // Tool calls
    const tcStats = db.select({
      total: count(),
    }).from(toolCalls).get()

    // File changes
    const fcStats = db.select({
      total: count(),
      additions: sum(fileChanges.additions),
      deletions: sum(fileChanges.deletions),
    }).from(fileChanges).get()

    // Repos
    const repoStats = db.select({
      total: count(),
    }).from(repos).get()

    // Agents per day (last 30 days) for activity chart
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const dailyAgents = db.select({
      date: sql<string>`date(${agents.createdAt})`.as("date"),
      count: count(),
    }).from(agents)
      .where(sql`${agents.createdAt} >= ${thirtyDaysAgo}`)
      .groupBy(sql`date(${agents.createdAt})`)
      .orderBy(sql`date(${agents.createdAt})`)
      .all()

    return {
      agents: {
        total: allAgents?.total ?? 0,
        active: activeAgents?.total ?? 0,
        deleted: deletedAgents?.total ?? 0,
      },
      messages: {
        total: msgStats?.total ?? 0,
        inputTokens: Number(msgStats?.inputTokens ?? 0),
        outputTokens: Number(msgStats?.outputTokens ?? 0),
        cacheReadTokens: Number(msgStats?.cacheReadTokens ?? 0),
        cacheWriteTokens: Number(msgStats?.cacheWriteTokens ?? 0),
      },
      toolCalls: tcStats?.total ?? 0,
      fileChanges: {
        total: fcStats?.total ?? 0,
        additions: Number(fcStats?.additions ?? 0),
        deletions: Number(fcStats?.deletions ?? 0),
      },
      repos: repoStats?.total ?? 0,
      dailyAgents,
    }
  })
}
