// Typed event-builder helper.
//
// Each domain declares a `defineEvents({...})` config map: keys are builder
// names, values describe the channel (`broadcast` or `emit`) and a `build`
// function that constructs the event payload from typed arguments. The factory
// returns a callable object — `agentsWs.agentUpdated(agent)` builds the
// payload and dispatches on the correct channel.
//
// Adding a new event is one entry in the config. The wire format is unchanged;
// the only thing that changes is the typing/ergonomics of the call sites.
//
// `InferEvents<typeof config>` derives the discriminated-union type a domain
// emits, used to compose the central `ServerEvent` union in `events.ts`.
//
// Example:
//
//   const agentsEventsConfig = {
//     agentUpdated: {
//       channel: "broadcast",
//       build: (agent: AgentSummary) => ({ type: "agent:updated" as const, agent }),
//     },
//     messageStart: {
//       channel: "emit",
//       build: (agentId: string, messageId: string) =>
//         ({ type: "message:start" as const, agentId, messageId }),
//     },
//   } satisfies EventsConfig
//
//   export const agentsWs = defineEvents(agentsEventsConfig)
//   export type AgentsServerEvent = InferEvents<typeof agentsEventsConfig>
//
//   // call sites:
//   agentsWs.agentUpdated(agent)
//   agentsWs.messageStart(agentId, messageId)
//
// `broadcast` builders are called as-is. `emit` builders take `agentId` as
// their first positional argument; the factory forwards `args[0]` to the
// underlying `emit(agentId, ...)` channel.
//
// For events whose payload shape is genuinely dynamic (e.g. forwarding
// arbitrary upstream Claude events), keep using the raw `broadcast()` /
// `emit()` exports from `handler.js` — those remain available as escape
// hatches.

import { broadcast, emit } from "./handler.js"

// All event payloads are discriminated by a literal `type` field.
type EventPayload = { type: string } & Record<string, unknown>

type BroadcastConfig<P extends EventPayload, Args extends readonly unknown[]> = {
  channel: "broadcast"
  build: (...args: Args) => P
}

type EmitConfig<P extends EventPayload, Args extends readonly unknown[]> = {
  channel: "emit"
  // First positional arg is the agentId used to route the emit.
  build: (agentId: string, ...args: Args) => P
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventConfig<P extends EventPayload = EventPayload, Args extends readonly unknown[] = any[]> =
  | BroadcastConfig<P, Args>
  | EmitConfig<P, Args>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventsConfig = Record<string, EventConfig<any, any>>

// Map config entry to its callable signature. The `infer P` slot is unused on
// purpose — only the `Args` tuple shape is needed to type the callable.
type BuilderFn<C> =
  C extends BroadcastConfig<infer P, infer Args>
    ? P extends EventPayload ? (...args: Args) => void : never
    : C extends EmitConfig<infer P, infer Args>
      ? P extends EventPayload ? (agentId: string, ...args: Args) => void : never
      : never

export type EventsApi<T extends EventsConfig> = { [K in keyof T]: BuilderFn<T[K]> }

// Union of every event payload a config produces.
export type InferEvents<T extends EventsConfig> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends { build: (...args: any[]) => infer P } ? P : never
}[keyof T]

/**
 * Build a typed callable object from an events config. See file header for
 * the full example.
 */
export function defineEvents<T extends EventsConfig>(config: T): EventsApi<T> {
  const out: Record<string, (...args: unknown[]) => void> = {}
  for (const key of Object.keys(config)) {
    const entry = config[key]!
    // The build's return is structurally a domain event (a member of ServerEvent),
    // but at this generic level TS only sees the loose EventPayload. The cast on
    // the broadcast/emit call narrows back to the union — safe because every
    // `build` in every domain's config returns a real ServerEvent variant.
    const build = entry.build as (...args: unknown[]) => EventPayload
    if (entry.channel === "broadcast") {
      out[key] = (...args: unknown[]) => {
        broadcast(build(...args) as Parameters<typeof broadcast>[0])
      }
    } else {
      out[key] = (...args: unknown[]) => {
        const agentId = args[0] as string
        emit(agentId, build(...args) as Parameters<typeof emit>[1])
      }
    }
  }
  return out as EventsApi<T>
}
