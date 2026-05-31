import type { WebSocket } from "@fastify/websocket"
import { clientEventSchema } from "@huxflux/shared"
import type { ServerEvent } from "./events.js"

// Map of agentId → set of subscribed WebSocket connections
const subscriptions = new Map<string, Set<WebSocket>>()

// All connected sockets (for broadcasting agent-level events)
const allSockets = new Set<WebSocket>()

export function registerSocket(socket: WebSocket) {
  allSockets.add(socket)

  socket.on("message", (raw: Buffer | string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw.toString())
    } catch {
      console.warn("[ws] dropped non-JSON client frame")
      return
    }

    // Discriminated-union validation: bad frames are logged and dropped
    // rather than crashing the connection. The shared `clientEventSchema`
    // ensures the server and every client share a single source of truth
    // for the envelope shape.
    const result = clientEventSchema.safeParse(parsed)
    if (!result.success) {
      console.warn("[ws] dropped malformed client frame:", result.error.issues)
      return
    }

    const event = result.data
    if (event.type === "subscribe") {
      let subs = subscriptions.get(event.agentId)
      if (!subs) { subs = new Set(); subscriptions.set(event.agentId, subs) }
      subs.add(socket)
    } else {
      subscriptions.get(event.agentId)?.delete(socket)
    }
  })

  socket.on("close", () => {
    allSockets.delete(socket)
    for (const [agentId, subs] of subscriptions) {
      subs.delete(socket)
      if (subs.size === 0) subscriptions.delete(agentId)
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
