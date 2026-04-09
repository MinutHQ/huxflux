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
        periodKey: `wtd-${today}`,
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
        periodKey: `last-week-${lastMonday.getFullYear()}-W${String(weekNum).padStart(2, "0")}`,
        label: "Last week",
      }
    }
    case "last-month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
      return {
        from: lastMonth.toISOString().slice(0, 10),
        to: lastDay.toISOString().slice(0, 10),
        periodKey: `last-month-${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
        label: "Last month",
      }
    }
    case "last-year": {
      const year = now.getFullYear() - 1
      return {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        periodKey: `last-year-${year}`,
        label: `${year}`,
      }
    }
    case "custom": {
      if (!from || !to) throw new Error("Custom period requires 'from' and 'to' query params")
      return {
        from,
        to,
        periodKey: `custom-${from}-${to}`,
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
  app.get<{ Querystring: { period?: string; from?: string; to?: string } }>(
    "/api/wrapped",
    async (req) => {
      const period = (req.query.period ?? "wtd") as Period
      const validPeriods: Period[] = ["wtd", "last-week", "last-month", "last-year", "custom"]
      if (!validPeriods.includes(period)) {
        throw new Error(`Invalid period: ${period}`)
      }

      const range = getDateRange(period, req.query.from, req.query.to)

      // Check cache
      const cached = db.select().from(wrappedSummaries)
        .where(eq(wrappedSummaries.periodKey, range.periodKey))
        .get()

      if (cached) {
        return { summary: cached.summary, periodKey: cached.periodKey, cached: true }
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

      // Top agents by message count
      const topAgents = db.select({
        title: agents.title,
        msgCount: count(),
      }).from(messages)
        .innerJoin(agents, eq(messages.agentId, agents.id))
        .where(sql`${messages.createdAt} >= ${fromISO} AND ${messages.createdAt} <= ${toISO}`)
        .groupBy(agents.id)
        .orderBy(sql`count(*) DESC`)
        .limit(5)
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
        db.insert(wrappedSummaries).values({
          id: randomUUID(),
          periodKey: range.periodKey,
          summary,
          statsJson: "{}",
          createdAt: new Date().toISOString(),
        }).run()
        return { summary, periodKey: range.periodKey, cached: false }
      }

      const statsForPrompt = {
        period: range.label,
        from: range.from,
        to: range.to,
        agents: totalAgents,
        done: statusMap["done"] ?? 0,
        inProgress: statusMap["in-progress"] ?? 0,
        inReview: statusMap["in-review"] ?? 0,
        cancelled: statusMap["cancelled"] ?? 0,
        backlog: statusMap["backlog"] ?? 0,
        messages: totalMessages,
        tokens: formatTokens(totalTokens),
        toolCalls: totalToolCalls,
        files: totalFiles,
        additions,
        deletions,
        avgDuration,
        topAgents: topAgents.map((a: { title: string }) => a.title).join(", ") || "None",
        repos: repoList.map((r: { name: string }) => r.name).join(", ") || "None",
      }

      const prompt = `You are writing a brief summary of AI coding agent activity for a developer dashboard.

Time period: ${statsForPrompt.period} (${statsForPrompt.from} to ${statsForPrompt.to})

Stats:
- ${statsForPrompt.agents} agents (${statsForPrompt.done} done, ${statsForPrompt.inProgress} in progress, ${statsForPrompt.inReview} in review, ${statsForPrompt.cancelled} cancelled, ${statsForPrompt.backlog} backlog)
- ${statsForPrompt.messages} messages (${statsForPrompt.tokens} tokens)
- ${statsForPrompt.toolCalls} tool calls
- ${statsForPrompt.files} files changed (+${statsForPrompt.additions} / -${statsForPrompt.deletions} lines)
- Avg completed agent duration: ${statsForPrompt.avgDuration}
- Top agents by activity: ${statsForPrompt.topAgents}
- Repos involved: ${statsForPrompt.repos}

Write 2-3 short paragraphs summarizing this period. Be specific with numbers. Mention highlights and velocity. Professional but warm tone, like a weekly standup summary. Plain prose only — no bullets, headers, or markdown formatting.`

      const summary = await generateSummary(prompt)

      db.insert(wrappedSummaries).values({
        id: randomUUID(),
        periodKey: range.periodKey,
        summary,
        statsJson: JSON.stringify(statsForPrompt),
        createdAt: new Date().toISOString(),
      }).run()

      return { summary, periodKey: range.periodKey, cached: false }
    },
  )
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
