// Cross-platform Zod schemas for the automations subsystem. The server-side
// canonical types live in apps/server/src/domains/automations/types.ts; these
// mirror the public-facing JSON shape exposed by the HTTP API and are validated
// at the client boundary via `reqValidated()` in `./api.ts`.
//
// Field-shape note: the server emits raw Drizzle rows for some columns. The
// `runs` array on `Automation` is loaded by the server but may be empty in
// list-style payloads (see `loadAllAutomations`), so consumers must not assume
// it is populated.

import { z } from "zod/v4"

// ── AutomationStatus ─────────────────────────────────────────────────────────

export const automationStatusSchema = z.enum(["draft", "active", "paused", "error"])

export type AutomationStatus = z.infer<typeof automationStatusSchema>

// ── AutomationStep ───────────────────────────────────────────────────────────

export const automationStepTypeSchema = z.enum([
  "trigger",
  "fetch",
  "parse",
  "compare",
  "transform",
  "notify",
  "browser",
  "conditional",
  "custom",
])

export type AutomationStepType = z.infer<typeof automationStepTypeSchema>

export const automationStepSchema = z.object({
  id: z.string(),
  type: automationStepTypeSchema,
  label: z.string(),
  config: z.record(z.string(), z.unknown()),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  // IDs of next steps.
  connections: z.array(z.string()),
})

export type AutomationStep = z.infer<typeof automationStepSchema>

// ── AutomationRun ────────────────────────────────────────────────────────────

export const automationRunStatusSchema = z.enum(["running", "success", "failure"])

export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>

export const automationRunSchema = z.object({
  id: z.string(),
  automationId: z.string(),
  status: automationRunStatusSchema,
  output: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
})

export type AutomationRun = z.infer<typeof automationRunSchema>

// ── AutomationSkill ──────────────────────────────────────────────────────────

export const automationSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  scriptPath: z.string(),
  createdAt: z.string(),
})

export type AutomationSkill = z.infer<typeof automationSkillSchema>

// ── Automation ───────────────────────────────────────────────────────────────
//
// Silent-drift note: the server returns rows directly from Drizzle, which
// means columns the schema does not list (e.g. `stepsJson`, `scriptPath`,
// `stateJson`) are also present on the wire. Zod's default behavior strips
// unknown keys, which is what we want — the client should only see the fields
// declared here. The server's response handler in `routes.ts` parses
// `stepsJson` into `steps` before sending, so the wire shape matches.

export const automationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: automationStatusSchema,
  schedule: z.string().nullable(),
  steps: z.array(automationStepSchema),
  builderAgentId: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastRunStatus: z.string().nullable(),
  runCount: z.number(),
  runs: z.array(automationRunSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Automation = z.infer<typeof automationSchema>

// ── Request bodies (server-validated, optionally client-validated) ───────────

export const createAutomationBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

export type CreateAutomationBody = z.infer<typeof createAutomationBodySchema>

// The update body mirrors the columns the server allows to be patched. Every
// field is optional (PATCH-style semantics) so the schema accepts partial
// payloads. `stepsJson` is the raw stringified JSON of the steps array — the
// server stores it as-is and parses it on read.
export const updateAutomationBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  schedule: z.string().optional(),
  stepsJson: z.string().optional(),
})

export type UpdateAutomationBody = z.infer<typeof updateAutomationBodySchema>

export const replyToAutomationBuilderBodySchema = z.object({
  content: z.string(),
})

export type ReplyToAutomationBuilderBody = z.infer<typeof replyToAutomationBuilderBodySchema>
