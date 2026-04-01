import { useEffect, useRef, useCallback } from "react"
import { getActiveServer } from "./serverStore"
import type { AgentSummary, Message, ToolCall, FileChange } from "./types"

export type ServerEvent =
  | { type: "agent:updated";    agent: AgentSummary }
  | { type: "agent:deleted";    agentId: string }
  | { type: "message:start";    agentId: string; messageId: string }
  | { type: "message:chunk";    agentId: string; messageId: string; delta: string }
  | { type: "message:thinking"; agentId: string; messageId: string; delta: string }
  | { type: "tool:call";        agentId: string; messageId: string; toolCall: ToolCall }
  | { type: "tool:result";      agentId: string; messageId: string; toolCallId: string; result: string }
  | { type: "message:done";     agentId: string; messageId: string; message: Message }
  | { type: "terminal:line";    agentId: string; line: string }
  | { type: "subagent:event";   agentId: string; toolUseId: string; event: Record<string, unknown> }
  | { type: "file:changed";     agentId: string; files: FileChange[] }
  | { type: "error";            agentId?: string; message: string }
  | { type: "ws:reconnected" }

type Handler = (event: ServerEvent) => void

// ── Active server singleton ───────────────────────────────────────────────────

let socket: WebSocket | null = null
const handlers = new Set<Handler>()
const subscriptions = new Set<string>()
let connectedWsUrl: string | null = null

function getActiveWsUrl(): string {
  const server = getActiveServer()
  const base = server?.url ?? "http://localhost:3001"
  const wsUrl = base.replace(/^http/, "ws") + "/ws"
  return server?.token ? `${wsUrl}?token=${server.token}` : wsUrl
}

function connect() {
  const wsUrl = getActiveWsUrl()

  if (socket && socket.readyState <= WebSocket.OPEN && connectedWsUrl === wsUrl) return

  if (socket && connectedWsUrl !== wsUrl) {
    socket.onclose = null
    socket.close()
    socket = null
  }

  connectedWsUrl = wsUrl
  socket = new WebSocket(wsUrl)

  let isFirstOpen = true
  socket.onopen = () => {
    for (const agentId of subscriptions) {
      socket!.send(JSON.stringify({ type: "subscribe", agentId }))
    }
    if (!isFirstOpen) {
      // Notify handlers so they can refetch stale data after reconnect
      for (const handler of handlers) handler({ type: "ws:reconnected" } as any)
    }
    isFirstOpen = false
  }

  socket.onmessage = (e) => {
    try {
      const event: ServerEvent = JSON.parse(e.data as string)
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
