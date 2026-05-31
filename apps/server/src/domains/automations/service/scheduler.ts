import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { automations, automationRuns } from "../automations.db.js"
import { automationsWs } from "../automations.ws.js"
import { executeFlow } from "./runners.js"

// In-memory timer registry. One setInterval per active+scheduled automation.
const scheduledTimers = new Map<string, ReturnType<typeof setInterval>>()

/** Parse "every Ns/m/h/d" into milliseconds; returns null if unparseable. */
export function parseScheduleMs(schedule: string): number | null {
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

export function scheduleAutomation(id: string, schedule: string) {
  unscheduleAutomation(id)
  const ms = parseScheduleMs(schedule)
  if (!ms) return
  console.info(`[automations] scheduling ${id} every ${ms}ms`)
  const timer = setInterval(() => void executeAutomation(id), ms)
  scheduledTimers.set(id, timer)
}

export function unscheduleAutomation(id: string) {
  const timer = scheduledTimers.get(id)
  if (timer) {
    clearInterval(timer)
    scheduledTimers.delete(id)
  }
}

/** Execute one automation now, persisting a run record and broadcasting events. */
export async function executeAutomation(automationId: string) {
  const automation = db.select().from(automations).where(eq(automations.id, automationId)).get() as { id: string; status: string; stepsJson: string | null; stateJson: string | null; runCount: number | null } | undefined
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

  automationsWs.runStarted(automationId, runId)

  try {
    const steps = automation.stepsJson ? JSON.parse(automation.stepsJson) : []
    if (steps.length === 0) throw new Error("No steps configured")

    const state = automation.stateJson ? JSON.parse(automation.stateJson) : {}
    const result = await executeFlow(steps, state, automationId)

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

    if (result.notify) automationsWs.notification(automationId, result.notify)

    automationsWs.runCompleted(automationId, runId, "success")
  } catch (err) {
    const finishedAt = new Date().toISOString()
    const message = err instanceof Error ? err.message : String(err)
    db.update(automationRuns).set({
      status: "failure",
      error: message,
      finishedAt,
    }).where(eq(automationRuns.id, runId)).run()

    db.update(automations).set({
      lastRunStatus: "failure",
      runCount: (automation.runCount ?? 0) + 1,
      updatedAt: finishedAt,
    }).where(eq(automations.id, automationId)).run()

    automationsWs.runCompleted(automationId, runId, "failure")
    console.error(`[automations] ${automationId} failed:`, message)
  }
}

/** Read every active+scheduled automation row and start its timer. */
export function startScheduler() {
  const active = db.select().from(automations).all().filter((a) => a.status === "active" && a.schedule)
  for (const a of active) {
    if (a.schedule) scheduleAutomation(a.id, a.schedule)
  }
  console.info(`[automations] started ${active.length} scheduled automation(s)`)
}
