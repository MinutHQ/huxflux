// `useHuxfluxQuery` — thin wrapper over TanStack `useQuery` that lets the
// caller declare server-event reactions inline with the query.
//
// Before this hook, consumers wrote `useQuery(...)` and then a separate
// `useAgentEvents(...)` block to push WS events into the query cache. The two
// blocks lived apart, so every consumer re-implemented the same cache-patch
// boilerplate (`queryClient.setQueryData(key, ...)`, `invalidateQueries(...)`).
// `useHuxfluxQuery` collapses that into one declaration:
//
//   useHuxfluxQuery({
//     queryKey: queryKeys.agents.detail(id),
//     queryFn: () => api.agents.get(id),
//     on: {
//       "agent:updated": (event, h) => { if (event.agent.id === id) h.setData(event.agent) },
//       "agent:deleted": (_, h) => h.invalidate(),
//     },
//   })
//
// Each handler receives the typed event (narrowed by event-type key) plus a
// `helpers` object with `setData`, `invalidate`, and the raw `queryClient` as
// an escape hatch. The event subscription is scoped to the component via the
// existing `useAgentEvents` plumbing.

import { useQuery, type UseQueryOptions, type UseQueryResult, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useAgentEvents } from "./ws.js"
import type { ServerEvent } from "./ws.js"

// Map of event-type → event payload, narrowed off the `ServerEvent` discriminated union.
type EventOf<K extends ServerEvent["type"]> = Extract<ServerEvent, { type: K }>

export interface ReactiveQueryHelpers<T> {
  /** Replace the cached query data (or update via a previous-value callback). */
  setData: (data: T | ((prev: T | undefined) => T)) => void
  /** Mark the query stale and trigger a refetch. */
  invalidate: () => void
  /** Escape hatch for advanced cache surgery (e.g. updating sibling queries). */
  queryClient: QueryClient
}

export type EventHandler<K extends ServerEvent["type"], T> = (
  event: EventOf<K>,
  helpers: ReactiveQueryHelpers<T>,
) => void | Promise<void>

export type EventHandlers<T> = {
  [K in ServerEvent["type"]]?: EventHandler<K, T>
}

export interface UseHuxfluxQueryOptions<T, TQueryKey extends readonly unknown[] = readonly unknown[]>
  extends UseQueryOptions<T, Error, T, TQueryKey> {
  /** Handlers keyed by `ServerEvent["type"]`. Each runs only for its matching event. */
  on?: EventHandlers<T>
}

export function useHuxfluxQuery<T, TQueryKey extends readonly unknown[] = readonly unknown[]>(
  options: UseHuxfluxQueryOptions<T, TQueryKey>,
): UseQueryResult<T, Error> {
  const { on, ...queryOptions } = options
  const queryClient = useQueryClient()
  const result = useQuery(queryOptions)

  // Subscribe to ALL server events (agentId = null). The handler-map gates on
  // event type, so listening to everything is correct here; the per-agent
  // filtering remains the caller's responsibility inside individual handlers
  // (the same way useAgentEvents works today).
  useAgentEvents(null, (event) => {
    if (!on) return
    const handler = on[event.type] as EventHandler<typeof event.type, T> | undefined
    if (!handler) return
    const helpers: ReactiveQueryHelpers<T> = {
      setData: (data) => {
        if (typeof data === "function") {
          queryClient.setQueryData<T>(options.queryKey, data as (prev: T | undefined) => T)
        } else {
          queryClient.setQueryData<T>(options.queryKey, data)
        }
      },
      invalidate: () => {
        void queryClient.invalidateQueries({ queryKey: options.queryKey })
      },
      queryClient,
    }
    // The handler's event parameter is narrowed by its key in the map, but
    // TypeScript can't see that here because `event.type` is a runtime value.
    void handler(event as EventOf<typeof event.type>, helpers)
  })

  return result
}
