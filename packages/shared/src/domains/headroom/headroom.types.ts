import { z } from "zod/v4"

// Progress of an unattended `headroom` CLI install started from the UI.
export const headroomInstallStateSchema = z.object({
  state: z.enum(["idle", "running", "succeeded", "failed"]),
  installer: z.string().nullable(),
  command: z.string().nullable(),
  log: z.array(z.string()),
  error: z.string().nullable(),
})
export type HeadroomInstallState = z.infer<typeof headroomInstallStateSchema>

// Whether the Headroom compression proxy is usable on the server machine.
// `installed` reflects the `headroom` binary; `running` reflects a live proxy
// (either one Huxflux spawned, `managed: true`, or one the user started).
export const headroomStatusSchema = z.object({
  installed: z.boolean(),
  running: z.boolean(),
  managed: z.boolean(),
  port: z.number(),
  url: z.string().nullable(),
  error: z.string().nullable(),
  install: headroomInstallStateSchema,
  /** True when uv or pipx is on the server PATH, so an unattended install can be offered. */
  canInstall: z.boolean(),
})
export type HeadroomStatus = z.infer<typeof headroomStatusSchema>

// Per-agent savings come from the proxy's per-project table (keyed by the
// `X-Headroom-Project` header the server sets to the agent id). Cache figures
// are proxy-wide because the proxy cannot attribute cache busts per project.
export const headroomAgentSavingsSchema = z.object({
  requests: z.number(),
  tokensSaved: z.number(),
  savingsPercent: z.number(),
  savingsUsd: z.number(),
  inputTokens: z.number(),
  lastActivityAt: z.string().nullable(),
})
export type HeadroomAgentSavings = z.infer<typeof headroomAgentSavingsSchema>

export const headroomProxyCacheSchema = z.object({
  tokensSavedByCompression: z.number().nullable(),
  tokensLostToCacheBust: z.number().nullable(),
  cacheBustCount: z.number().nullable(),
  bustsAvoided: z.number().nullable(),
})
export type HeadroomProxyCache = z.infer<typeof headroomProxyCacheSchema>

export const headroomAgentStatsSchema = z.object({
  agent: headroomAgentSavingsSchema.nullable(),
  proxy: headroomProxyCacheSchema.nullable(),
})
export type HeadroomAgentStats = z.infer<typeof headroomAgentStatsSchema>
