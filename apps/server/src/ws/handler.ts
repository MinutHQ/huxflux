import type { WebSocket } from "@fastify/websocket"
import type { ClientEvent, ServerEvent } from "./events.js"

// Map of agentId → set of subscribed WebSocket connections
const subscriptions = new Map<string, Set<WebSocket>>()

// All connected sockets (for broadcasting agent-level events)
const allSockets = new Set<WebSocket>()

export function registerSocket(socket: WebSocket) {
  allSockets.add(socket)

  socket.on("message", (raw: Buffer | string) => {
    try {
      const event: ClientEvent = JSON.parse(raw.toString())
      if (event.type === "subscribe") {
        let subs = subscriptions.get(event.agentId)
        if (!subs) { subs = new Set(); subscriptions.set(event.agentId, subs) }
        subs.add(socket)
      } else if (event.type === "unsubscribe") {
        subscriptions.get(event.agentId)?.delete(socket)
      }
    } catch {
      // ignore malformed messages
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
