import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { v4 as uuid } from "uuid"
import os from "os"
import { eq, desc } from "drizzle-orm"
import {
  createAutomationBodySchema,
  updateAutomationBodySchema,
  replyToAutomationBuilderBodySchema,
} from "@huxflux/shared"
import { db } from "../../db/index.js"
import { automations, automationRuns } from "./automations.db.js"
import { agents } from "../../db/schema.js"
import { buildAutomationSystemPrompt } from "./service/prompt.js"
import { getSettings } from "../settings/settings.service.js"
import { automationsWs } from "./automations.ws.js"
import { executeAutomation, scheduleAutomation, unscheduleAutomation } from "./service/scheduler.js"
import { runAgent } from "../agent-runner/agent-runner.service.js"
import {
  automationTriggerHandler,
  automationStepHandler,
  automationRemoveHandler,
  automationConfigHandler,
} from "./runnerTags.js"
import { agentTitleHandler } from "../agents/runnerTags.js"
import type { Automation, AutomationRun } from "./automations.types.js"
import { logger } from "../../logger.js"

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadAutomation(id: string): Automation | null {
  const row = db.select().from(automations).where(eq(automations.id, id)).get()
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
  } as Automation
}

function loadAllAutomations(): Automation[] {
  const rows = db.select().from(automations).orderBy(desc(automations.updatedAt)).all()
  return rows.map((row) => ({
    ...row,
    steps: row.stepsJson ? JSON.parse(row.stepsJson) : [],
    runs: [],
  })) as Automation[]
}

// ── Mutations ────────────────────────────────────────────────────────────────

function createAutomation(name: string, description: string | undefined): Automation | null {
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

  automationsWs.automationCreated(id)
  return loadAutomation(id)
}

type AutomationUpdateBody = Partial<{
  name: string
  description: string
  status: string
  schedule: string
  stepsJson: string
}>

function updateAutomation(id: string, body: AutomationUpdateBody): Automation | { error: string } {
  const existing = db.select().from(automations).where(eq(automations.id, id)).get()
  if (!existing) return { error: "Not found" }

  db.update(automations).set({
    ...body,
    updatedAt: new Date().toISOString(),
  }).where(eq(automations.id, id)).run()

  const newStatus = body.status ?? existing.status
  const schedule = body.schedule ?? existing.schedule

  if (newStatus === "active" && schedule) scheduleAutomation(id, schedule)
  else if (newStatus !== "active") unscheduleAutomation(id)

  automationsWs.automationUpdated(id)
  return loadAutomation(id)!
}

function deleteAutomation(id: string): { ok: true } {
  unscheduleAutomation(id)
  db.delete(automations).where(eq(automations.id, id)).run()
  automationsWs.automationDeleted(id)
  return { ok: true }
}

async function runAutomationOnce(id: string): Promise<AutomationRun | { error: string }> {
  const automation = db.select().from(automations).where(eq(automations.id, id)).get()
  if (!automation) return { error: "Not found" }
  await executeAutomation(id)
  const runs = db.select().from(automationRuns)
    .where(eq(automationRuns.automationId, id))
    .orderBy(desc(automationRuns.startedAt))
    .limit(1)
    .all() as AutomationRun[]
  return runs[0] ?? { error: "Run not found" }
}

// ── Builder agent ────────────────────────────────────────────────────────────

interface ReplyResult { agentId: string }

async function replyToBuilder(automationId: string, content: string): Promise<ReplyResult | { error: string }> {
  const automation = db.select().from(automations).where(eq(automations.id, automationId)).get()
  if (!automation) return { error: "Not found" }

  let agentId = automation.builderAgentId

  if (agentId) {
    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()
    if (!agent || agent.deletedAt) agentId = null
  }

  if (!agentId) {
    agentId = await spawnBuilderAgent(automation, content)
  }

  return { agentId }
}

type AutomationRow = { id: string; name: string; description: string | null }

async function spawnBuilderAgent(automation: AutomationRow, content: string): Promise<string> {
  const agentId = uuid()
  const now = new Date().toISOString()
  const settings = getSettings()

  db.insert(agents).values({
    id: agentId,
    title: `Builder: ${automation.name.slice(0, 40)}`,
    status: "in-progress",
    branch: "main",
    model: settings.defaultModel ?? "Sonnet 4.6",
    location: `automation-builder-${automation.id.slice(0, 8)}`,
    noWorktree: 1,
    provider: settings.defaultProvider ?? "claude",
    createdAt: now,
    updatedAt: now,
  }).run()

  db.update(automations).set({
    builderAgentId: agentId,
    updatedAt: now,
  }).where(eq(automations.id, automation.id)).run()

  const systemPrompt = buildAutomationSystemPrompt(automation.id, automation.name, automation.description)

  try {
    const descriptionLine = automation.description ? `\n\nDescription: ${automation.description}` : ""
    const userMessage = content || `Help me set up this automation: "${automation.name}"${descriptionLine}`
    runAgent(userMessage, {
      agentId,
      worktreePath: os.homedir(),
      taskContext: systemPrompt,
      model: settings.defaultModel,
      provider: settings.defaultProvider,
      tags: [
        agentTitleHandler(agentId),
        automationTriggerHandler(agentId),
        automationStepHandler(agentId),
        automationRemoveHandler(agentId),
        automationConfigHandler(agentId),
      ],
    })
  } catch (err) {
    logger.error({ err }, "[automation] failed to start builder")
  }

  return agentId
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const idParamsSchema = z.object({ id: z.string() })

export const automationsPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/automations", async () => loadAllAutomations())

  app.get("/api/automations/:id", {
    schema: { params: idParamsSchema },
  }, async (req) => loadAutomation(req.params.id) ?? { error: "Not found" })

  app.post("/api/automations", {
    schema: { body: createAutomationBodySchema },
  }, async (req) => {
    return createAutomation(req.body.name, req.body.description)
  })

  app.put("/api/automations/:id", {
    schema: { params: idParamsSchema, body: updateAutomationBodySchema },
  }, async (req) => {
    return updateAutomation(req.params.id, req.body)
  })

  app.delete("/api/automations/:id", {
    schema: { params: idParamsSchema },
  }, async (req) => deleteAutomation(req.params.id))

  app.post("/api/automations/:id/run", {
    schema: { params: idParamsSchema },
  }, async (req) => runAutomationOnce(req.params.id))

  app.get("/api/automations/:id/runs", {
    schema: { params: idParamsSchema },
  }, async (req) =>
    db.select().from(automationRuns)
      .where(eq(automationRuns.automationId, req.params.id))
      .orderBy(desc(automationRuns.startedAt))
      .limit(50)
      .all() as AutomationRun[])

  app.post("/api/automations/:id/reply", {
    schema: { params: idParamsSchema, body: replyToAutomationBuilderBodySchema },
  }, async (req) => {
    return replyToBuilder(req.params.id, req.body.content)
  })
}
