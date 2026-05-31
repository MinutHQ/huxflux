import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { automations as automationsTable } from "../automations.db.js"
import { automationsWs } from "../automations.ws.js"
import type { AutomationStep } from "../automations.types.js"
import { defineTagHandler, type TagHandler } from "../../agent-runner/agent-runner.types.js"

// Tag handlers for `<huxflux:automations.*>` directives emitted by the
// automation builder agent. Each handler resolves the automation associated
// with the running agent (via `builderAgentId`), applies a single mutation,
// and broadcasts an update.

type AutomationRow = typeof automationsTable.$inferSelect

function loadBuilderAutomation(agentId: string): AutomationRow | null {
  return db.select().from(automationsTable).where(eq(automationsTable.builderAgentId, agentId)).get() ?? null
}

function loadSteps(row: AutomationRow): AutomationStep[] {
  if (!row.stepsJson) return []
  try {
    return JSON.parse(row.stepsJson) as AutomationStep[]
  } catch {
    return []
  }
}

function persistSteps(row: AutomationRow, steps: AutomationStep[], extra: Record<string, unknown> = {}): void {
  assignPositions(steps)
  db.update(automationsTable)
    .set({ stepsJson: JSON.stringify(steps), updatedAt: new Date().toISOString(), ...extra })
    .where(eq(automationsTable.id, row.id))
    .run()
  automationsWs.automationUpdated(row.id)
}

function assignPositions(steps: AutomationStep[]): void {
  const visited = new Set<string>()
  let y = 0
  const visit = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    const step = steps.find((s) => s.id === id)
    if (!step) return
    step.position = { x: 0, y }
    y++
    for (const conn of step.connections) visit(conn)
  }
  const trigger = steps.find((s) => s.id === "trigger")
  if (trigger) visit(trigger.id)
  for (const step of steps) visit(step.id)
}

/**
 * `<huxflux:automations.trigger type="schedule" interval="1h"/>`
 *
 * Replaces (or inserts) the automation's trigger step. Schedule triggers also
 * update the automation's `schedule` column so the scheduler picks them up.
 */
export function automationTriggerHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "automations.trigger",
    args: z.object({
      type: z.enum(["schedule", "event", "manual"]).default("manual"),
      interval: z.string().optional(),
      event: z.string().optional(),
    }),
    onTag: ({ args }) => {
      const row = loadBuilderAutomation(agentId)
      if (!row) return
      const steps = loadSteps(row)
      const label = args.type === "schedule" ? `Every ${args.interval ?? "1h"}`
        : args.type === "event" ? `On ${args.event ?? "event"}`
        : "Manual trigger"
      const triggerStep: AutomationStep = {
        id: "trigger",
        type: "trigger",
        label,
        config: { triggerType: args.type, interval: args.interval ?? "", event: args.event ?? "" },
        position: { x: 0, y: 0 },
        connections: [],
      }
      const existingIdx = steps.findIndex((s) => s.id === "trigger")
      if (existingIdx >= 0) {
        triggerStep.connections = steps[existingIdx].connections
        steps[existingIdx] = triggerStep
      } else {
        steps.unshift(triggerStep)
      }
      const extra: Record<string, unknown> = {}
      if (args.type === "schedule" && args.interval) extra.schedule = `every ${args.interval}`
      persistSteps(row, steps, extra)
    },
  })
}

/**
 * `<huxflux:automations.step id="..." type="..." after="...">body</huxflux:automations.step>`
 *
 * Inserts or replaces a pipeline step. The body is a colon-separated key/value
 * map; `label` is pulled out as the step label and the rest becomes the
 * config. Connections from the `after` step are wired automatically.
 */
export function automationStepHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "automations.step",
    args: z.object({ id: z.string().min(1), type: z.string().min(1), after: z.string().default("trigger") }),
    onTag: ({ args, body }) => {
      const row = loadBuilderAutomation(agentId)
      if (!row) return
      const steps = loadSteps(row)
      const config = parseStepBody(body)
      const label = config.label ?? args.type
      delete config.label
      const newStep: AutomationStep = {
        id: args.id,
        type: args.type as AutomationStep["type"],
        label,
        config,
        position: { x: 0, y: 0 },
        connections: [],
      }
      const existingIdx = steps.findIndex((s) => s.id === args.id)
      if (existingIdx >= 0) {
        newStep.connections = steps[existingIdx].connections
        steps[existingIdx] = newStep
      } else {
        steps.push(newStep)
      }
      const afterBase = args.after.replace(/:true|:false$/, "")
      const afterStep = steps.find((s) => s.id === afterBase)
      if (afterStep && !afterStep.connections.includes(args.id)) afterStep.connections.push(args.id)
      persistSteps(row, steps)
    },
  })
}

/**
 * `<huxflux:automations.remove id="STEP_ID"/>`
 *
 * Deletes a step from the pipeline and prunes any references to it from
 * other steps' connections.
 */
export function automationRemoveHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "automations.remove",
    args: z.object({ id: z.string().min(1) }),
    onTag: ({ args }) => {
      const row = loadBuilderAutomation(agentId)
      if (!row) return
      const steps = loadSteps(row).filter((s) => s.id !== args.id)
      for (const s of steps) s.connections = s.connections.filter((c) => c !== args.id)
      persistSteps(row, steps)
    },
  })
}

/**
 * `<huxflux:automations.config name="..." status="..." schedule="..."/>`
 *
 * Applies top-level automation metadata updates (name, status, schedule).
 * All attributes are optional; only provided ones are written.
 */
export function automationConfigHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "automations.config",
    args: z.object({ name: z.string().optional(), status: z.string().optional(), schedule: z.string().optional() }),
    onTag: ({ args }) => {
      const row = loadBuilderAutomation(agentId)
      if (!row) return
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (args.name) updates.name = args.name
      if (args.status) updates.status = args.status
      if (args.schedule) updates.schedule = args.schedule
      if (Object.keys(updates).length === 1) return
      db.update(automationsTable).set(updates).where(eq(automationsTable.id, row.id)).run()
      automationsWs.automationUpdated(row.id)
    },
  })
}

function parseStepBody(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of body.split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      if (key && value) out[key] = value
    }
  }
  return out
}
