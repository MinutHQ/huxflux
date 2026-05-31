// WebSocket events emitted by the automations domain.
//
// See `apps/server/src/domains/ws/define.ts` for the helper that turns this
// config map into the typed `automationsWs` callable object. The composed
// `ServerEvent` union in `src/domains/ws/events.ts` reads
// `AutomationsServerEvent` from here.

import { defineEvents, type InferEvents } from "../ws/define.js"

const automationsEventsConfig = {
  automationCreated: {
    channel: "broadcast",
    build: (automationId: string) => ({ type: "automation:created" as const, automationId }),
  },
  automationUpdated: {
    channel: "broadcast",
    build: (automationId: string) => ({ type: "automation:updated" as const, automationId }),
  },
  automationDeleted: {
    channel: "broadcast",
    build: (automationId: string) => ({ type: "automation:deleted" as const, automationId }),
  },
  runStarted: {
    channel: "broadcast",
    build: (automationId: string, runId: string) => ({ type: "automation:run-started" as const, automationId, runId }),
  },
  runCompleted: {
    channel: "broadcast",
    build: (automationId: string, runId: string, status: "success" | "failure") =>
      ({ type: "automation:run-completed" as const, automationId, runId, status }),
  },
  notification: {
    channel: "broadcast",
    build: (automationId: string, message: string) => ({ type: "automation:notification" as const, automationId, message }),
  },
} as const

export const automationsWs = defineEvents(automationsEventsConfig)

export type AutomationsServerEvent = InferEvents<typeof automationsEventsConfig>
