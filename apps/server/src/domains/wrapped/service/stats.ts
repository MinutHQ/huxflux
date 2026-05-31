import { count, sum, sql, eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents, messages, toolCalls, fileChanges, repos } from "../../../db/schema.js"
import type { DateRange, FileRow, GatheredStats, InProgressRow, ShippedRow } from "../wrapped.types.js"
import { formatDuration, formatTokens } from "./formatting.js"

/**
 * Run all the wrapped-summary DB queries for a given date window and return
 * the shaped data the prompt builder consumes. The split here mirrors the
 * original `wrapped.ts`: one query per logical group, then a small reduce
 * pass to turn the rows into headline numbers.
 */
export function gatherStats(range: DateRange): GatheredStats {
  const fromISO = `${range.from}T00:00:00.000Z`
  const toISO = `${range.to}T23:59:59.999Z`

  const agentStats = db.select({ total: count() }).from(agents)
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO}`)
    .get()

  const statusBreakdown = db.select({ status: agents.status, count: count() }).from(agents)
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO}`)
    .groupBy(agents.status)
    .all()

  const msgStats = db.select({
    total: count(),
    inputTokens: sum(messages.inputTokens),
    outputTokens: sum(messages.outputTokens),
  }).from(messages)
    .where(sql`${messages.createdAt} >= ${fromISO} AND ${messages.createdAt} <= ${toISO}`)
    .get()

  const tcStats = db.select({ total: count() }).from(toolCalls)
    .innerJoin(messages, eq(toolCalls.messageId, messages.id))
    .where(sql`${messages.createdAt} >= ${fromISO} AND ${messages.createdAt} <= ${toISO}`)
    .get()

  const fcStats = db.select({
    total: count(),
    additions: sum(fileChanges.additions),
    deletions: sum(fileChanges.deletions),
  }).from(fileChanges)
    .innerJoin(agents, eq(fileChanges.agentId, agents.id))
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO}`)
    .get()

  const shippedAgents = queryShippedAgents(fromISO, toISO)
  const inProgressAgents = queryInProgressAgents(fromISO, toISO)
  const topFiles = queryTopFiles(fromISO, toISO)
  const avgDuration = computeAvgDuration(fromISO, toISO)
  const repoList = queryRepoList(fromISO, toISO)

  const statusMap = Object.fromEntries(
    statusBreakdown.map((s: { status: string; count: number }) => [s.status, s.count]),
  )

  return {
    totalAgents: agentStats?.total ?? 0,
    doneCount: statusMap["done"] ?? 0,
    inReviewCount: statusMap["in-review"] ?? 0,
    inProgressCount: statusMap["in-progress"] ?? 0,
    totalMessages: msgStats?.total ?? 0,
    totalTokens: Number(msgStats?.inputTokens ?? 0) + Number(msgStats?.outputTokens ?? 0),
    totalToolCalls: tcStats?.total ?? 0,
    totalFiles: fcStats?.total ?? 0,
    additions: Number(fcStats?.additions ?? 0),
    deletions: Number(fcStats?.deletions ?? 0),
    avgDuration,
    shippedAgents,
    inProgressAgents,
    topFiles,
    reposLabel: repoList.map((r: { name: string }) => r.name).join(", ") || "None",
    statusMap,
  }
}

function queryShippedAgents(fromISO: string, toISO: string): ShippedRow[] {
  return db.select({
    title: agents.title,
    description: agents.description,
    status: agents.status,
    repoName: repos.name,
    additions: sql<number>`COALESCE(SUM(${fileChanges.additions}), 0)`,
    deletions: sql<number>`COALESCE(SUM(${fileChanges.deletions}), 0)`,
    fileCount: sql<number>`COUNT(DISTINCT ${fileChanges.path})`,
  }).from(agents)
    .leftJoin(repos, eq(agents.repoId, repos.id))
    .leftJoin(fileChanges, eq(fileChanges.agentId, agents.id))
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO} AND ${agents.status} IN ('done', 'in-review')`)
    .groupBy(agents.id)
    .orderBy(sql`COALESCE(SUM(${fileChanges.additions} + ${fileChanges.deletions}), 0) DESC`)
    .limit(20)
    .all() as ShippedRow[]
}

function queryInProgressAgents(fromISO: string, toISO: string): InProgressRow[] {
  return db.select({
    title: agents.title,
    repoName: repos.name,
  }).from(agents)
    .leftJoin(repos, eq(agents.repoId, repos.id))
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO} AND ${agents.status} = 'in-progress'`)
    .orderBy(sql`${agents.updatedAt} DESC`)
    .limit(10)
    .all() as InProgressRow[]
}

function queryTopFiles(fromISO: string, toISO: string): FileRow[] {
  return db.select({
    path: fileChanges.path,
    repoName: repos.name,
    total: sql<number>`SUM(${fileChanges.additions} + ${fileChanges.deletions})`,
  }).from(fileChanges)
    .innerJoin(agents, eq(fileChanges.agentId, agents.id))
    .leftJoin(repos, eq(agents.repoId, repos.id))
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO}`)
    .groupBy(fileChanges.path, repos.name)
    .orderBy(sql`SUM(${fileChanges.additions} + ${fileChanges.deletions}) DESC`)
    .limit(15)
    .all() as FileRow[]
}

function computeAvgDuration(fromISO: string, toISO: string): string {
  const doneAgents = db.select({
    createdAt: agents.createdAt,
    updatedAt: agents.updatedAt,
  }).from(agents)
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO} AND ${agents.status} = 'done'`)
    .all()

  if (doneAgents.length === 0) return "N/A"
  const totalMs = doneAgents.reduce((acc: number, a: { createdAt: string; updatedAt: string }) => {
    return acc + (new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime())
  }, 0)
  return formatDuration(totalMs / doneAgents.length)
}

function queryRepoList(fromISO: string, toISO: string): Array<{ name: string }> {
  return db.select({ name: repos.name }).from(repos)
    .innerJoin(agents, eq(agents.repoId, repos.id))
    .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO}`)
    .groupBy(repos.id)
    .all()
}

export { formatTokens }
