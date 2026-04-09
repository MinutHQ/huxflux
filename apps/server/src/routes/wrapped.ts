import type { FastifyInstance } from "fastify"
import { execFileSync, spawn } from "node:child_process"
import { count, sum, sql, eq, and } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, fileChanges, repos, wrappedSummaries } from "../db/schema.js"

let _claudeBin: string | null = null
function getClaudeBin(): string {
  if (_claudeBin) return _claudeBin
  if (process.env.CLAUDE_BIN) { _claudeBin = process.env.CLAUDE_BIN; return _claudeBin }
  try { _claudeBin = execFileSync("which", ["claude"], { encoding: "utf8" }).trim() }
  catch { _claudeBin = "claude" }
  return _claudeBin
}

type Period = "wtd" | "last-week" | "last-month" | "last-year" | "custom"
type Length = "short" | "medium" | "long"

const LENGTH_INSTRUCTIONS: Record<Length, string> = {
  short: "Write a single tight paragraph (3–5 sentences). Mention only the 1–2 biggest themes and name the repo(s) involved. Skip minor work.",
  medium: "Write 2–3 short paragraphs. Group related work thematically and name the repo for each change. Cover the main themes; minor work can be mentioned briefly.",
  long: "Write 4–6 paragraphs. Cover every significant piece of work, grouped by repo or theme. Include specific file paths or code areas where they help paint the picture. Still prose, not a list.",
}

function getDateRange(period: Period, from?: string, to?: string): { from: string; to: string; periodKey: string; label: string } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  switch (period) {
    case "wtd": {
      const day = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - ((day + 6) % 7))
      return {
        from: monday.toISOString().slice(0, 10),
        to: today,
        periodKey: `wtd-v3-${today}`,
        label: "Week to date",
      }
    }
    case "last-week": {
      const day = now.getDay()
      const thisMonday = new Date(now)
      thisMonday.setDate(now.getDate() - ((day + 6) % 7))
      const lastMonday = new Date(thisMonday)
      lastMonday.setDate(thisMonday.getDate() - 7)
      const lastSunday = new Date(thisMonday)
      lastSunday.setDate(thisMonday.getDate() - 1)
      const weekNum = getISOWeek(lastMonday)
      return {
        from: lastMonday.toISOString().slice(0, 10),
        to: lastSunday.toISOString().slice(0, 10),
        periodKey: `last-week-v3-${lastMonday.getFullYear()}-W${String(weekNum).padStart(2, "0")}`,
        label: "Last week",
      }
    }
    case "last-month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
      return {
        from: lastMonth.toISOString().slice(0, 10),
        to: lastDay.toISOString().slice(0, 10),
        periodKey: `last-month-v3-${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
        label: "Last month",
      }
    }
    case "last-year": {
      const year = now.getFullYear() - 1
      return {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        periodKey: `last-year-v3-${year}`,
        label: `${year}`,
      }
    }
    case "custom": {
      if (!from || !to) throw new Error("Custom period requires 'from' and 'to' query params")
      return {
        from,
        to,
        periodKey: `custom-v3-${from}-${to}`,
        label: `${from} to ${to}`,
      }
    }
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3600_000).toFixed(1)}h`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export async function wrappedRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { period?: string; from?: string; to?: string; refresh?: string; length?: string } }>(
    "/api/wrapped",
    async (req, reply) => {
      try {
      const period = (req.query.period ?? "wtd") as Period
      const validPeriods: Period[] = ["wtd", "last-week", "last-month", "last-year", "custom"]
      if (!validPeriods.includes(period)) {
        throw new Error(`Invalid period: ${period}`)
      }

      const validLengths: Length[] = ["short", "medium", "long"]
      const length: Length = validLengths.includes(req.query.length as Length)
        ? (req.query.length as Length)
        : "medium"

      const refresh = req.query.refresh === "true" || req.query.refresh === "1"
      const baseRange = getDateRange(period, req.query.from, req.query.to)
      // Scope cache key by length so each variant is cached independently
      const range = { ...baseRange, periodKey: `${baseRange.periodKey}-${length}` }

      // Check cache (skipped when refresh=true). We use upsert at write time
      // so there's no race between delete and insert on rapid regenerate clicks.
      if (!refresh) {
        const cached = db.select().from(wrappedSummaries)
          .where(eq(wrappedSummaries.periodKey, range.periodKey))
          .get()

        if (cached) {
          return { summary: cached.summary, periodKey: cached.periodKey, cached: true }
        }
      }

      // Gather stats for the date range
      const fromISO = `${range.from}T00:00:00.000Z`
      const toISO = `${range.to}T23:59:59.999Z`

      const agentStats = db.select({
        total: count(),
      }).from(agents)
        .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO}`)
        .get()

      const statusBreakdown = db.select({
        status: agents.status,
        count: count(),
      }).from(agents)
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

      const tcStats = db.select({
        total: count(),
      }).from(toolCalls)
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

      // Shipped / in-review agents — these are the actual changes that landed
      const shippedAgents = db.select({
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
        .all()

      // In-progress agents — work underway
      const inProgressAgents = db.select({
        title: agents.title,
        repoName: repos.name,
      }).from(agents)
        .leftJoin(repos, eq(agents.repoId, repos.id))
        .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO} AND ${agents.status} = 'in-progress'`)
        .orderBy(sql`${agents.updatedAt} DESC`)
        .limit(10)
        .all()

      // Top touched files per repo — helps Claude infer themes
      const topFiles = db.select({
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
        .all()

      // Average duration for completed agents
      const doneAgents = db.select({
        createdAt: agents.createdAt,
        updatedAt: agents.updatedAt,
      }).from(agents)
        .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO} AND ${agents.status} = 'done'`)
        .all()

      let avgDuration = "N/A"
      if (doneAgents.length > 0) {
        const totalMs = doneAgents.reduce((acc: number, a: { createdAt: string; updatedAt: string }) => {
          return acc + (new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime())
        }, 0)
        avgDuration = formatDuration(totalMs / doneAgents.length)
      }

      // Repos involved
      const repoList = db.select({
        name: repos.name,
      }).from(repos)
        .innerJoin(agents, eq(agents.repoId, repos.id))
        .where(sql`${agents.createdAt} >= ${fromISO} AND ${agents.createdAt} <= ${toISO}`)
        .groupBy(repos.id)
        .all()

      const statusMap = Object.fromEntries(statusBreakdown.map((s: { status: string; count: number }) => [s.status, s.count]))
      const totalAgents = agentStats?.total ?? 0
      const totalMessages = msgStats?.total ?? 0
      const totalTokens = Number(msgStats?.inputTokens ?? 0) + Number(msgStats?.outputTokens ?? 0)
      const totalToolCalls = tcStats?.total ?? 0
      const totalFiles = fcStats?.total ?? 0
      const additions = Number(fcStats?.additions ?? 0)
      const deletions = Number(fcStats?.deletions ?? 0)

      // If no activity, return a simple message without calling Claude
      if (totalAgents === 0 && totalMessages === 0) {
        const summary = "No agent activity in this period."
        upsertSummary(range.periodKey, summary, "{}")
        return { summary, periodKey: range.periodKey, cached: false }
      }

      const doneCount = statusMap["done"] ?? 0
      const inReviewCount = statusMap["in-review"] ?? 0
      const inProgressCount = statusMap["in-progress"] ?? 0

      type ShippedRow = { title: string; description: string | null; status: string; repoName: string | null; additions: number; deletions: number; fileCount: number }
      type InProgressRow = { title: string; repoName: string | null }
      type FileRow = { path: string; repoName: string | null; total: number }

      const shippedLines = shippedAgents.length > 0
        ? (shippedAgents as ShippedRow[]).map((a) => {
            const repo = a.repoName ?? "unknown repo"
            const desc = a.description ? ` — ${a.description.slice(0, 140)}` : ""
            const churn = Number(a.fileCount) > 0 ? ` [${a.fileCount} files, +${Number(a.additions)}/-${Number(a.deletions)}]` : ""
            const statusTag = a.status === "in-review" ? " (in review)" : ""
            return `- [${repo}] ${a.title}${statusTag}${desc}${churn}`
          }).join("\n")
        : "- (nothing shipped yet)"

      const inProgressLines = inProgressAgents.length > 0
        ? (inProgressAgents as InProgressRow[]).map((a) => `- [${a.repoName ?? "unknown repo"}] ${a.title}`).join("\n")
        : "- (none)"

      const topFileLines = topFiles.length > 0
        ? (topFiles as FileRow[]).map((f) => `- [${f.repoName ?? "unknown repo"}] ${f.path} (+/-${Number(f.total)} lines)`).join("\n")
        : "- (no file changes tracked)"

      const statsForPrompt = {
        period: range.label,
        from: range.from,
        to: range.to,
        agents: totalAgents,
        done: doneCount,
        inProgress: inProgressCount,
        inReview: inReviewCount,
        cancelled: statusMap["cancelled"] ?? 0,
        backlog: statusMap["backlog"] ?? 0,
        messages: totalMessages,
        tokens: formatTokens(totalTokens),
        toolCalls: totalToolCalls,
        files: totalFiles,
        additions,
        deletions,
        avgDuration,
        shipped: (shippedAgents as ShippedRow[]).map((a) => a.title),
        inProgressTitles: (inProgressAgents as InProgressRow[]).map((a) => a.title),
        topFiles: (topFiles as FileRow[]).map((f) => f.path),
        repos: repoList.map((r: { name: string }) => r.name).join(", ") || "None",
      }

      const prompt = `You are writing a short narrative recap of the coding work a developer shipped this period. The reader is the developer themselves — they want to see the *substance* of what changed, not raw statistics.

Time period: ${statsForPrompt.period} (${statsForPrompt.from} to ${statsForPrompt.to})
Repos active: ${statsForPrompt.repos}

Each line below is prefixed with [repo-name] so you know which project each change belongs to.

Shipped or in review (${doneCount} shipped, ${inReviewCount} in review):
${shippedLines}

Currently in progress (${inProgressCount}):
${inProgressLines}

Most-touched files (helps you infer themes):
${topFileLines}

Totals for context (use sparingly): ${totalFiles} files touched, +${additions}/-${deletions} lines across ${totalAgents} agents.

Length: ${LENGTH_INSTRUCTIONS[length]}

Narrate what was actually built. Group related work thematically — use the titles, descriptions, and file paths to infer themes (e.g. "auth overhaul", "home-view polish", "database migrations"). **Always name the repo** when you describe a change, so the reader knows where the work landed (e.g. "In huxflux, the notification pipeline got a major speed boost…"). If work spans multiple repos, organize by repo or call out cross-repo efforts explicitly. Lead with the biggest or most interesting changes. Numbers are support, not the story — sprinkle them in, don't lead with them. Warm, first-person-ish tone, like the developer summarizing their week to a teammate. Plain prose only — no bullets, headers, or markdown.`

      let summary: string
      try {
        summary = await generateSummary(prompt)
      } catch (err) {
        req.log.error({ err, periodKey: range.periodKey }, "wrapped: summary generation failed")
        throw new Error(`Summary generation failed: ${(err as Error).message}`)
      }

      upsertSummary(range.periodKey, summary, JSON.stringify(statsForPrompt))

      return { summary, periodKey: range.periodKey, cached: false }
      } catch (err) {
        req.log.error({ err }, "wrapped: request failed")
        reply.code(500)
        return { error: (err as Error).message || "Internal error" }
      }
    },
  )
}

function upsertSummary(periodKey: string, summary: string, statsJson: string): void {
  db.insert(wrappedSummaries).values({
    id: randomUUID(),
    periodKey,
    summary,
    statsJson,
    createdAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: wrappedSummaries.periodKey,
    set: {
      summary,
      statsJson,
      createdAt: new Date().toISOString(),
    },
  }).run()
}

function generateSummary(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getClaudeBin(), [
      "--print",
      "--output-format", "text",
      "--model", "claude-haiku-4-5",
      "--max-turns", "1",
      prompt,
    ], { stdio: ["ignore", "pipe", "pipe"] })

    let output = ""
    proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString() })

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error("Summary generation timed out"))
    }, 30_000)

    proc.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0 && output.trim()) {
        resolve(output.trim())
      } else {
        reject(new Error(`Summary generation failed (exit ${code})`))
      }
    })
    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}
