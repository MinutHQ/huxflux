// Server-side re-export of the cross-platform automation types.
//
// Historically this file held a hand-maintained mirror of the shared
// shapes because pulling `@huxflux/shared` from the server was thought to
// break the Node16 CJS resolution. That constraint no longer applies —
// the rest of the automations server slice already imports the shared
// schemas (see routes.ts) — so this module just re-exports the canonical
// types instead of duplicating them.
export type {
  Automation,
  AutomationRun,
  AutomationStatus,
  AutomationStep,
} from "@huxflux/shared"
