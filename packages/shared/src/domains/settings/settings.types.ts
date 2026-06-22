// Cross-platform types for the settings domain. `HuxfluxSettings` is derived
// from the schema in `./schema.ts` (the single source of truth for shape +
// defaults + metadata). The Zod runtime schema (`huxfluxSettingsSchema`) is
// built from the same descriptor map so client + server stay in lockstep:
// adding a new entry to `settingsSchema` automatically updates both the type
// and the Zod validator.

import { z } from "zod/v4"
import { settingsSchema, type SettingDef, type HuxfluxSettings } from "./settings.schema.js"

export type { HuxfluxSettings } from "./settings.schema.js"

function fieldSchema(def: SettingDef): z.ZodTypeAny {
  switch (def.type) {
    case "boolean": return z.boolean()
    case "number": {
      let s: z.ZodNumber = z.number()
      if (def.min !== undefined) s = s.min(def.min)
      if (def.max !== undefined) s = s.max(def.max)
      return s
    }
    case "string":
    case "longtext":
    case "select":
      return z.string()
    case "custom":
      return z.unknown()
  }
}

// Build a record { [key]: optional<fieldSchema> } from the settings schema
// descriptor. Every field is optional — the persisted blob only stores
// explicitly-set keys; defaults fill in the rest at read time.
const shape = Object.fromEntries(
  Object.entries(settingsSchema).map(([key, def]) => [key, fieldSchema(def).optional()]),
) as Record<keyof typeof settingsSchema, z.ZodOptional<z.ZodTypeAny>>

export const huxfluxSettingsSchema = z.object(shape) as unknown as z.ZodType<HuxfluxSettings>

// Same schema but used at write-time: client sends a partial update; server
// merges into the existing blob. Identical to the read schema because every
// field is already optional.
export const partialHuxfluxSettingsSchema = huxfluxSettingsSchema

// ── ProviderInfo ─────────────────────────────────────────────────────────────

export const providerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  available: z.boolean(),
  capabilities: z.record(z.string(), z.union([z.boolean(), z.array(z.string())])),
  models: z.array(z.object({
    id: z.string(),
    label: z.string(),
    api: z.string(),
  })),
})

export type ProviderInfo = z.infer<typeof providerInfoSchema>

// ── Misc settings endpoints ──────────────────────────────────────────────────

export const serverConfigSchema = z.object({
  githubEnabled: z.boolean(),
  feedbackEnabled: z.boolean(),
})

export type ServerConfig = z.infer<typeof serverConfigSchema>

export const serverVersionInfoSchema = z.object({
  current: z.string(),
  latest: z.string().nullable(),
  updateAvailable: z.boolean(),
})

export type ServerVersionInfo = z.infer<typeof serverVersionInfoSchema>

export const updateResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type UpdateResult = z.infer<typeof updateResultSchema>

export const feedbackRequestSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
})

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>

export const feedbackResponseSchema = z.object({
  url: z.string(),
  number: z.number(),
})

export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>

// ── GitHub status ───────────────────────────────────────────────────────────

export const githubStatusSchema = z.object({
  connected: z.boolean(),
  login: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  scopes: z.array(z.string()),
  rateLimitRemaining: z.number().nullable(),
  rateLimitTotal: z.number().nullable(),
  error: z.string().nullable(),
})

export type GitHubStatus = z.infer<typeof githubStatusSchema>
