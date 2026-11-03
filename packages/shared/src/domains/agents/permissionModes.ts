import { z } from "zod/v4"

// How much an agent may do without asking. The values are Claude Code's own
// permission-mode vocabulary so they pass through to the CLI flag and the SDK
// option unchanged; other providers support a subset (see each provider's
// `capabilities.permissionModes`).
//
//   default           every risky action asks
//   acceptEdits       file edits in the workspace are automatic, the rest asks
//   plan              research only, no edits
//   auto              no prompts; a classifier reviews each action first
//   dontAsk           pre-approved tools only, anything that would ask is denied
//   bypassPermissions no checks at all — only safe inside a sandbox
export const permissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
])

export type PermissionMode = z.infer<typeof permissionModeSchema>

/** Labels for the pickers. Kept here so web and mobile agree on the wording. */
export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  default: "Ask every time",
  acceptEdits: "Auto-accept edits",
  plan: "Plan only",
  auto: "Automatic (reviewed)",
  dontAsk: "Never ask (deny)",
  bypassPermissions: "No restrictions",
}
