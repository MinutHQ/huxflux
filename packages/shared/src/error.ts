// Cross-platform HTTP error shape shared between client and server. The
// server's global error handler emits responses that conform to
// `apiErrorSchema`; the client's `req()` wrapper parses non-2xx bodies with
// the same schema and throws `HuxfluxApiError` so callers can branch on
// `code` instead of pattern-matching messages.
//
// Codes are stable, machine-readable strings (e.g. "agent.not_found",
// "validation.failed", "auth.unauthorized", "server.internal"). Messages
// are human-readable. `details` is optional structured info (e.g. Zod
// validation issues).

import { z } from "zod/v4"

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

export class HuxfluxApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = "HuxfluxApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}
