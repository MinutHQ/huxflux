// Cross-platform Zod schemas for the servers domain (huxflux server registry +
// reachability status). The store and hooks consume these. The schemas are
// also used to validate values read out of the on-disk storage adapter so the
// app refuses to deserialize a corrupted blob into a wrong-shaped object.

import { z } from "zod/v4"

// ── HuxfluxServer ────────────────────────────────────────────────────────────

export const huxfluxServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  token: z.string().optional(),
  addedAt: z.string(),
})

export type HuxfluxServer = z.infer<typeof huxfluxServerSchema>

// ── ServerStatus ─────────────────────────────────────────────────────────────

export const serverStatusSchema = z.enum(["online", "offline", "checking", "unauthorized"])

export type ServerStatus = z.infer<typeof serverStatusSchema>
