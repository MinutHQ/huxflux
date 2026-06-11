import type { WebSocket } from "@fastify/websocket"
import { clientEventSchema } from "@huxflux/shared"
import type { ServerEvent } from "./events.js"
import { logger } from "../../logger.js"

// Map of agentId → set of subscribed WebSocket connections
const subscriptions = new Map<string, Set<WebSocket>>()

// All connected sockets (for broadcasting agent-level events)
const allSockets = new Set<WebSocket>()

// Listeners notified when an agent gains its first subscriber or loses its
// last one. Lets other domains attach/detach per-agent work (e.g. the git file
// watcher) to the set of agents a client actually has open, without this
// transport module importing those domains — the wiring happens at the server
// entrypoint. `active` is true on the first subscriber, false on the last.
type SubscriptionListener = (agentId: string, active: boolean) => void
const subscriptionListeners = new Set<SubscriptionListener>()

export function onAgentSubscription(listener: SubscriptionListener): () => void {
  subscriptionListeners.add(listener)
  return () => subscriptionListeners.delete(listener)
}

function notifySubscription(agentId: string, active: boolean): void {
  for (const listener of subscriptionListeners) {
    try { listener(agentId, active) } catch { /* a listener must not break WS handling */ }
  }
}

export function registerSocket(socket: WebSocket) {
  allSockets.add(socket)

  socket.on("message", (raw: Buffer | string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw.toString())
    } catch {
      logger.warn("[ws] dropped non-JSON client frame")
      return
    }

    // Discriminated-union validation: bad frames are logged and dropped
    // rather than crashing the connection. The shared `clientEventSchema`
    // ensures the server and every client share a single source of truth
    // for the envelope shape.
    const result = clientEventSchema.safeParse(parsed)
    if (!result.success) {
      logger.warn({ err: result.error.issues }, "[ws] dropped malformed client frame")
      return
    }

    const event = result.data
    if (event.type === "subscribe") {
      let subs = subscriptions.get(event.agentId)
      if (!subs) { subs = new Set(); subscriptions.set(event.agentId, subs) }
      const wasEmpty = subs.size === 0
      subs.add(socket)
      if (wasEmpty) notifySubscription(event.agentId, true)
    } else {
      const subs = subscriptions.get(event.agentId)
      if (subs && subs.delete(socket) && subs.size === 0) {
        subscriptions.delete(event.agentId)
        notifySubscription(event.agentId, false)
      }
    }
  })

  socket.on("close", () => {
    allSockets.delete(socket)
    for (const [agentId, subs] of subscriptions) {
      if (subs.delete(socket) && subs.size === 0) {
        subscriptions.delete(agentId)
        notifySubscription(agentId, false)
      }
    }
  })
}

export function emit(agentId: string, event: ServerEvent) {
  const payload = JSON.stringify(event)
  const subs = subscriptions.get(agentId)
  if (subs) {
    for (const socket of subs) {
      if (socket.readyState === socket.OPEN) socket.send(payload)
    }
  }
}

export function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event)
  for (const socket of allSockets) {
    if (socket.readyState === socket.OPEN) socket.send(payload)
  }
}
