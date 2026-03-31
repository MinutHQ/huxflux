import type { PRStatus } from "../types.js"

/** Derive agent status from PR state. Shared between poller and github routes. */
export function prStatusToAgentStatus(pr: PRStatus): string {
  if (pr.merged) return "done"
  if (pr.state === "closed") return "cancelled"
  if (pr.draft) return "in-progress"
  return "in-review"
}

/** Parse a JSON-encoded PRStatus string from the DB, returning undefined on failure. */
export function parsePrStatus(raw: string | null | undefined): PRStatus | undefined {
  if (!raw) return undefined
  try { return JSON.parse(raw) as PRStatus } catch { return undefined }
}
