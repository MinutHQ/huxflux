import { useEffect, useRef, useCallback, useSyncExternalStore } from "react"
import { z } from "zod/v4"
import { getActiveServer } from "./domains/servers/servers.store.js"
import type { AgentsServerEvent } from "./domains/agents/agents.types.js"
import type { TasksServerEvent } from "./domains/tasks/tasks.types.js"

// ── Client → Server envelope ─────────────────────────────────────────────────
// Every message the client sends to the server over `/ws` matches one of these
// variants. Both sides share this schema so the server can validate inbound
// frames and the client can build them via the typed `clientWs` builder rather
// than hand-rolling `JSON.stringify({ type: "subscribe", agentId })` literals.

export const subscribeEventSchema = z.object({
  type: z.literal("subscribe"),
  agentId: z.string(),
})

export const unsubscribeEventSchema = z.object({
  type: z.literal("unsubscribe"),
  agentId: z.string(),
})

export const clientEventSchema = z.discriminatedUnion("type", [
  subscribeEventSchema,
  unsubscribeEventSchema,
])

export type ClientEvent = z.infer<typeof clientEventSchema>

// Typed envelope builder. Call sites use `clientWs.subscribe(agentId)` instead
// of writing the literal shape inline. The return type is `ClientEvent` so
// passing it through `JSON.stringify` is safe by construction.
export const clientWs = {
  subscribe: (agentId: string): ClientEvent => ({ type: "subscribe", agentId }),
  unsubscribe: (agentId: string): ClientEvent => ({ type: "unsubscribe", agentId }),
}

// Automation events emitted by the server-side flat automations routes /
// runners. Lives here because the shared `automations` domain doesn't
// have its own ws.ts yet.
export type AutomationsServerEvent =
  | { type: "automation:created";       automationId: string }
  | { type: "automation:updated";       automationId: string }
  | { type: "automation:deleted";       automationId: string }
  | { type: "automation:run-started";   automationId: string; runId: string }
  | { type: "automation:run-completed"; automationId: string; runId: string; status: "success" | "failure" }
  | { type: "automation:notification";  automationId: string; message: string }

// Top-level `ServerEvent` union — composed from per-domain unions plus a few
// transport-level events (error, ws:reconnected) that don't belong to any
// single domain.
export type ServerEvent =
  | AgentsServerEvent
  | TasksServerEvent
  | AutomationsServerEvent
  | { type: "error";          agentId?: string; message: string }
  | { type: "ws:reconnected" }

type Handler = (event: ServerEvent) => void

// ── Active server singleton ───────────────────────────────────────────────────

let socket: WebSocket | null = null
const handlers = new Set<Handler>()
const subscriptions = new Set<string>()
let connectedWsUrl: string | null = null
let socketEverOpened = false  // true after the first successful open for the current URL

// ── Connection state ──────────────────────────────────────────────────────────

let wsConnected = false
let disconnectTimer: ReturnType<typeof setTimeout> | null = null
const connectedListeners = new Set<(connected: boolean) => void>()

function setWsConnected(value: boolean) {
  if (wsConnected === value) return
  wsConnected = value
  for (const l of connectedListeners) l(value)
}

function getActiveWsUrl(): string {
  const server = getActiveServer()
  const base = server?.url ?? "http://localhost:4321"
  const wsUrl = base.replace(/^http/, "ws") + "/ws"
  return server?.token ? `${wsUrl}?token=${server.token}` : wsUrl
}

function connect() {
  const wsUrl = getActiveWsUrl()

  if (socket && socket.readyState <= WebSocket.OPEN && connectedWsUrl === wsUrl) return

  if (socket && connectedWsUrl !== wsUrl) {
    if (disconnectTimer !== null) { clearTimeout(disconnectTimer); disconnectTimer = null }
    socket.onclose = null
    socket.close()
    socket = null
    socketEverOpened = false  // reset for the new URL
  }

  connectedWsUrl = wsUrl
  socket = new WebSocket(wsUrl)

  socket.onopen = () => {
    if (disconnectTimer !== null) { clearTimeout(disconnectTimer); disconnectTimer = null }
    setWsConnected(true)
    for (const agentId of subscriptions) {
      socket!.send(JSON.stringify(clientWs.subscribe(agentId)))
    }
    if (socketEverOpened) {
      // This is a reconnect — events may have been missed while disconnected
      for (const handler of handlers) handler({ type: "ws:reconnected" })
    }
    socketEverOpened = true
  }

  socket.onmessage = (e) => {
    try {
      const event: ServerEvent = JSON.parse(e.data as string)
      for (const handler of handlers) handler(event)
    } catch { /* ignore */ }
  }

  socket.onclose = () => {
    // Delay marking disconnected to avoid banner flicker on brief reconnects
    if (disconnectTimer === null) {
      disconnectTimer = setTimeout(() => {
        disconnectTimer = null
        setWsConnected(false)
      }, 1500)
    }
    setTimeout(connect, 2000)
  }
}

export function useAgentEvents(agentId: string | null, onEvent: Handler) {
  // Keep the latest handler in a ref so the subscription doesn't churn when
  // callers pass an inline arrow function. The ref is updated in an effect
  // (not during render) per the React refs rule. Refs are only allowed to
  // be read/written outside the render phase.
  const handlerRef = useRef(onEvent)
  useEffect(() => {
    handlerRef.current = onEvent
  })

  const stableHandler = useCallback((e: ServerEvent) => {
    if (agentId && "agentId" in e && e.agentId !== agentId) return
    handlerRef.current(e)
  }, [agentId])

  useEffect(() => {
    connect()
    handlers.add(stableHandler)

    if (agentId) {
      subscriptions.add(agentId)
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(clientWs.subscribe(agentId)))
      }
    }

    return () => {
      handlers.delete(stableHandler)
      if (agentId) {
        subscriptions.delete(agentId)
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(clientWs.unsubscribe(agentId)))
        }
      }
    }
  }, [agentId, stableHandler])
}

// ── Background server connections ─────────────────────────────────────────────

interface ConnectionState {
  socket: WebSocket
  handlers: Set<Handler>
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

const connections = new Map<string, ConnectionState>()

function openConnection(wsUrl: string): ConnectionState {
  const existing = connections.get(wsUrl)
  if (existing && existing.socket.readyState <= WebSocket.OPEN) return existing

  const state: ConnectionState = {
    socket: null!,
    handlers: existing?.handlers ?? new Set(),
    reconnectTimer: null,
  }

  function makeSocket() {
    const ws = new WebSocket(wsUrl)
    state.socket = ws

    ws.onmessage = (e) => {
      try {
        const event: ServerEvent = JSON.parse(e.data as string)
        for (const h of state.handlers) h(event)
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      if (state.reconnectTimer !== null) clearTimeout(state.reconnectTimer)
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null
        if (state.handlers.size > 0) makeSocket()
      }, 2000)
    }
  }

  makeSocket()
  connections.set(wsUrl, state)
  return state
}

// Stable subscribe fn for `useSyncExternalStore`. Defined at module scope so
// React doesn't see a new identity each render. Calling `connect()` here is
// the right place for the side-effect: subscribing to the connected state
// semantically requires the socket to be open.
function subscribeWsConnected(notify: () => void): () => void {
  connect()
  connectedListeners.add(notify)
  return () => { connectedListeners.delete(notify) }
}

function getWsConnectedSnapshot(): boolean {
  return wsConnected
}

function getWsConnectedServerSnapshot(): boolean {
  return false
}

export function useWsConnected(): boolean {
  return useSyncExternalStore(
    subscribeWsConnected,
    getWsConnectedSnapshot,
    getWsConnectedServerSnapshot,
  )
}

export function connectBackgroundServer(wsUrl: string, onEvent: Handler): () => void {
  const state = openConnection(wsUrl)
  state.handlers.add(onEvent)

  return () => {
    state.handlers.delete(onEvent)
    if (state.handlers.size === 0) {
      if (state.reconnectTimer !== null) clearTimeout(state.reconnectTimer)
      state.socket.onclose = null
      state.socket.close()
      connections.delete(wsUrl)
    }
  }
}
