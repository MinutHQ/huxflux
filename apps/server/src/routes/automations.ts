import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import os from "os"
import { eq, desc } from "drizzle-orm"
import { db } from "../db/index.js"
import { automations, automationRuns, automationSkills, agents } from "../db/schema.js"
import { broadcast } from "../ws/handler.js"
import { buildAutomationSystemPrompt } from "../automations/prompt.js"
import { getSettings } from "../settings.js"
import type { Automation, AutomationRun } from "@huxflux/shared"

// ── Scheduler ────────────────────────────────────────────────────────────────

const scheduledTimers = new Map<string, ReturnType<typeof setInterval>>()

function parseScheduleMs(schedule: string): number | null {
  const match = schedule.match(/^every\s+(\d+)\s*(s|sec|m|min|h|hr|d|day)s?$/i)
  if (!match) return null
  const [, num, unit] = match
  const n = parseInt(num)
  switch (unit.toLowerCase()) {
    case "s": case "sec": return n * 1000
    case "m": case "min": return n * 60_000
    case "h": case "hr": return n * 3_600_000
    case "d": case "day": return n * 86_400_000
    default: return null
  }
}

function scheduleAutomation(id: string, schedule: string) {
  unscheduleAutomation(id)
  const ms = parseScheduleMs(schedule)
  if (!ms) return
  console.log(`[automations] scheduling ${id} every ${ms}ms`)
  const timer = setInterval(() => void executeAutomation(id), ms)
  scheduledTimers.set(id, timer)
}

function unscheduleAutomation(id: string) {
  const timer = scheduledTimers.get(id)
  if (timer) {
    clearInterval(timer)
    scheduledTimers.delete(id)
  }
}

async function executeAutomation(automationId: string) {
  const automation = db.select().from(automations).where(eq(automations.id, automationId)).get() as any
  if (!automation || automation.status !== "active") return

  const runId = uuid()
  const now = new Date().toISOString()

  db.insert(automationRuns).values({
    id: runId,
    automationId,
    status: "running",
    startedAt: now,
  }).run()

  db.update(automations).set({
    lastRunAt: now,
    lastRunStatus: "running",
    updatedAt: now,
  }).where(eq(automations.id, automationId)).run()

  broadcast({ type: "automation:run-started", automationId, runId })

  try {
    const steps = automation.stepsJson ? JSON.parse(automation.stepsJson) : []
    if (steps.length === 0) throw new Error("No steps configured")

    const { executeFlow } = await import("../automations/runners.js")
    const state = automation.stateJson ? JSON.parse(automation.stateJson) : {}
    const result = await executeFlow(steps, state, automationId)

    // Persist updated state
    db.update(automations).set({
      stateJson: JSON.stringify(result.state),
    }).where(eq(automations.id, automationId)).run()

    const finishedAt = new Date().toISOString()
    db.update(automationRuns).set({
      status: "success",
      output: result.output != null ? JSON.stringify(result.output) : null,
      finishedAt,
    }).where(eq(automationRuns.id, runId)).run()

    db.update(automations).set({
      lastRunStatus: "success",
      runCount: (automation.runCount ?? 0) + 1,
      updatedAt: finishedAt,
    }).where(eq(automations.id, automationId)).run()

    if (result.notify) {
      broadcast({ type: "automation:notification", automationId, message: result.notify })
    }

    broadcast({ type: "automation:run-completed", automationId, runId, status: "success" })
  } catch (err: any) {
    const finishedAt = new Date().toISOString()
    db.update(automationRuns).set({
      status: "failure",
      error: err.message,
      finishedAt,
    }).where(eq(automationRuns.id, runId)).run()

    db.update(automations).set({
      lastRunStatus: "failure",
      runCount: (automation.runCount ?? 0) + 1,
      updatedAt: finishedAt,
    }).where(eq(automations.id, automationId)).run()

    broadcast({ type: "automation:run-completed", automationId, runId, status: "failure" })
    console.error(`[automations] ${automationId} failed:`, err.message)
  }
}

// ── Startup ──────────────────────────────────────────────────────────────────

export function startScheduler() {
  const active = db.select().from(automations).all().filter((a: any) => a.status === "active" && a.schedule)
  for (const a of active as any[]) {
    scheduleAutomation(a.id, a.schedule!)
  }
  console.log(`[automations] started ${active.length} scheduled automation(s)`)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadAutomation(id: string): Automation | null {
  const row = db.select().from(automations).where(eq(automations.id, id)).get() as any
  if (!row) return null
  const runs = db.select().from(automationRuns)
    .where(eq(automationRuns.automationId, id))
    .orderBy(desc(automationRuns.startedAt))
    .limit(20)
    .all() as AutomationRun[]

  return {
    ...row,
    steps: row.stepsJson ? JSON.parse(row.stepsJson) : [],
    runs,
  }
}

function loadAllAutomations(): Automation[] {
  const rows = db.select().from(automations).orderBy(desc(automations.updatedAt)).all() as any[]
  return rows.map((row) => ({
    ...row,
    steps: row.stepsJson ? JSON.parse(row.stepsJson) : [],
    runs: [],
  }))
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerAutomationRoutes(app: FastifyInstance) {
  app.get("/api/automations", async () => loadAllAutomations())

  app.get("/api/automations/:id", async (req) => {
    const { id } = req.params as { id: string }
    return loadAutomation(id) ?? { error: "Not found" }
  })

  app.post("/api/automations", async (req) => {
    const { name, description } = req.body as { name: string; description?: string }
    const id = uuid()
    const now = new Date().toISOString()

    db.insert(automations).values({
      id,
      name,
      description: description ?? null,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }).run()

    broadcast({ type: "automation:created", automationId: id })
    return loadAutomation(id)
  })

  app.put("/api/automations/:id", async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{
      name: string
      description: string
      status: string
      schedule: string
      stepsJson: string
    }>

    const existing = db.select().from(automations).where(eq(automations.id, id)).get() as any
    if (!existing) return { error: "Not found" }

    db.update(automations).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(eq(automations.id, id)).run()

    const newStatus = body.status ?? existing.status
    const schedule = body.schedule ?? existing.schedule

    if (newStatus === "active" && schedule) {
      scheduleAutomation(id, schedule)
    } else if (newStatus !== "active") {
      unscheduleAutomation(id)
    }

    broadcast({ type: "automation:updated", automationId: id })
    return loadAutomation(id)
  })

  app.delete("/api/automations/:id", async (req) => {
    const { id } = req.params as { id: string }
    unscheduleAutomation(id)
    db.delete(automations).where(eq(automations.id, id)).run()
    broadcast({ type: "automation:deleted", automationId: id })
    return { ok: true }
  })

  app.post("/api/automations/:id/run", async (req) => {
    const { id } = req.params as { id: string }
    const automation = db.select().from(automations).where(eq(automations.id, id)).get()
    if (!automation) return { error: "Not found" }
    await executeAutomation(id)
    const runs = db.select().from(automationRuns)
      .where(eq(automationRuns.automationId, id))
      .orderBy(desc(automationRuns.startedAt))
      .limit(1)
      .all() as AutomationRun[]
    return runs[0] ?? { error: "Run not found" }
  })

  app.get("/api/automations/:id/runs", async (req) => {
    const { id } = req.params as { id: string }
    return db.select().from(automationRuns)
      .where(eq(automationRuns.automationId, id))
      .orderBy(desc(automationRuns.startedAt))
      .limit(50)
      .all() as AutomationRun[]
  })

  app.post("/api/automations/:id/reply", async (req) => {
    const { id } = req.params as { id: string }
    const { content } = req.body as { content: string }
    const automation = db.select().from(automations).where(eq(automations.id, id)).get() as any
    if (!automation) return { error: "Not found" }

    let agentId = automation.builderAgentId

    if (agentId) {
      const agent = db.select().from(agents).where(eq(agents.id, agentId)).get() as any
      if (!agent || agent.deletedAt) agentId = null
    }

    if (!agentId) {
      agentId = uuid()
      const now = new Date().toISOString()
      const settings = getSettings()

      db.insert(agents).values({
        id: agentId,
        title: `Builder: ${automation.name.slice(0, 40)}`,
        status: "in-progress",
        branch: "main",
        model: settings.defaultModel ?? "Sonnet 4.6",
        location: `automation-builder-${id.slice(0, 8)}`,
        noWorktree: 1,
        provider: settings.defaultProvider ?? "claude",
        createdAt: now,
        updatedAt: now,
      }).run()

      db.update(automations).set({
        builderAgentId: agentId,
        updatedAt: now,
      }).where(eq(automations.id, id)).run()

      // Send the system prompt as context for the builder agent
      const systemPrompt = buildAutomationSystemPrompt(id, automation.name, automation.description)

      // Fire the initial message via the runner
      try {
        const { runClaude } = await import("../claude/runner.js")
        const userMessage = content || `Help me set up this automation: "${automation.name}"${automation.description ? `\n\nDescription: ${automation.description}` : ""}`
        runClaude(userMessage, {
          agentId,
          worktreePath: os.homedir(),
          taskContext: systemPrompt,
          model: settings.defaultModel,
          provider: settings.defaultProvider,
        })
      } catch (err) {
        console.error("[automation] failed to start builder:", err)
      }
    }

    return { agentId }
  })
}
