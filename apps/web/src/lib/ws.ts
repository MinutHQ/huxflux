import { useEffect, useRef, useCallback } from "react"
import { getServers, getActiveServerId } from "@/lib/serverStore"

export type ServerEvent =
  | { type: "agent:updated";    agent: Record<string, unknown> }
  | { type: "message:start";    agentId: string; messageId: string }
  | { type: "message:chunk";    agentId: string; messageId: string; delta: string }
  | { type: "message:thinking"; agentId: string; messageId: string; delta: string }
  | { type: "tool:call";        agentId: string; messageId: string; toolCall: Record<string, unknown> }
  | { type: "tool:result";      agentId: string; messageId: string; toolCallId: string; result: string }
  | { type: "message:done";     agentId: string; messageId: string; message: Record<string, unknown> }
  | { type: "terminal:line";    agentId: string; line: string }
  | { type: "file:changed";     agentId: string; files: unknown[] }
  | { type: "error";            agentId?: string; message: string }

type Handler = (event: ServerEvent) => void

// ── Active server singleton (shared across the app) ───────────────────────────

let socket: WebSocket | null = null
const handlers = new Set<Handler>()
const subscriptions = new Set<string>()
let connectedWsUrl: string | null = null

function getActiveWsUrl(): string {
  const servers = getServers()
  const activeId = getActiveServerId()
  const active = servers.find((s) => s.id === activeId) ?? servers[0]
  const base = active?.url ?? import.meta.env.VITE_API_URL ?? "http://localhost:3001"
  const wsUrl = base.replace(/^http/, "ws") + "/ws"
  return active?.token ? `${wsUrl}?token=${active.token}` : wsUrl
}

function connect() {
  const wsUrl = getActiveWsUrl()

  // If already connected to the right URL, nothing to do
  if (socket && socket.readyState <= WebSocket.OPEN && connectedWsUrl === wsUrl) return

  // Close existing socket if URL changed
  if (socket && connectedWsUrl !== wsUrl) {
    socket.onclose = null
    socket.close()
    socket = null
  }

  connectedWsUrl = wsUrl
  socket = new WebSocket(wsUrl)

  socket.onopen = () => {
    for (const agentId of subscriptions) {
      socket!.send(JSON.stringify({ type: "subscribe", agentId }))
    }
  }

  socket.onmessage = (e) => {
    try {
      const event: ServerEvent = JSON.parse(e.data)
      for (const handler of handlers) handler(event)
    } catch { /* ignore */ }
  }

  socket.onclose = () => {
    setTimeout(connect, 2000)
  }
}

export function useAgentEvents(agentId: string | null, onEvent: Handler) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  const stableHandler = useCallback((e: ServerEvent) => {
    // agentId=null means "global" — receive all events unfiltered
    if (agentId && "agentId" in e && e.agentId !== agentId) return
    handlerRef.current(e)
  }, [agentId])

  useEffect(() => {
    connect()
    handlers.add(stableHandler)

    if (agentId) {
      subscriptions.add(agentId)
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "subscribe", agentId }))
      }
    }

    return () => {
      handlers.delete(stableHandler)
      if (agentId) {
        subscriptions.delete(agentId)
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "unsubscribe", agentId }))
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
        const event: ServerEvent = JSON.parse(e.data)
        for (const h of state.handlers) h(event)
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      state.reconnectTimer = setTimeout(() => {
        if (state.handlers.size > 0) makeSocket()
      }, 2000)
    }
  }

  makeSocket()
  connections.set(wsUrl, state)
  return state
}

/**
 * Opens (or reuses) a background WS connection to the given URL.
 * Returns a cleanup function that removes the handler and closes
 * the connection if no more handlers are registered.
 */
export function connectBackgroundServer(
  wsUrl: string,
  onEvent: Handler
): () => void {
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
