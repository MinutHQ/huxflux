import { useState, useEffect } from "react"
import { useAgentEvents } from "@hive/shared"

const SESSION_KEY = "huxflux:streaming-agent"

function readSession(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY) } catch { return null }
}
function writeSession(id: string | null) {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id)
    else sessionStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}

/**
 * Tracks which agent is currently streaming, globally across all agents.
 * Survives page refreshes via sessionStorage: after a reload the WS
 * reconnects and incoming message:chunk events re-confirm the active agent.
 */
export function useStreamingAgentId(lastMessageDurationMs?: number | null): string | null {
  // Initialise from sessionStorage so the indicator survives a reload
  const [streamingId, setStreamingId] = useState<string | null>(readSession)

  // If the current agent's last message is complete, clear any stale sessionStorage value
  useEffect(() => {
    if (lastMessageDurationMs != null) {
      setStreamingId(null)
      writeSession(null)
    }
  }, [lastMessageDurationMs])

  useAgentEvents(null, (event) => {
    const agentId = (event as { agentId?: string }).agentId ?? null

    if (event.type === "message:start") {
      setStreamingId(agentId)
      writeSession(agentId)
    }

    // message:chunk fires continuously during streaming — use it to recover
    // the streaming agent after a page refresh (start was already missed)
    if (event.type === "message:chunk" && agentId) {
      setStreamingId((prev) => {
        if (prev === agentId) return prev   // already set, no re-render
        writeSession(agentId)
        return agentId
      })
    }

    if (event.type === "message:done") {
      setStreamingId(null)
      writeSession(null)
    }
  })

  return streamingId
}
