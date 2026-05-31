import type { AgentsServerEvent } from "../agents/agents.ws.js"
import type { AutomationsServerEvent } from "../automations/automations.ws.js"
import type { TasksServerEvent } from "../tasks/tasks.ws.js"

// Client → Server. The envelope is now defined once as a Zod schema in
// `@huxflux/shared` (`clientEventSchema`); this re-export keeps existing
// `ClientEvent` callers compiling without forking the type.
export type { ClientEvent } from "@huxflux/shared"

// Server → Client — composed from per-domain event types plus cross-domain
// events that don't belong to a single domain (transport-level errors).
export type ServerEvent =
  | AgentsServerEvent
  | AutomationsServerEvent
  | TasksServerEvent
  | { type: "error";         agentId?: string; message: string }
