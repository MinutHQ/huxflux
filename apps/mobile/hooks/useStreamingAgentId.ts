import { useState } from "react"
import { useAgentEvents } from "@huxflux/shared"

/**
 * Tracks which agent is currently streaming, globally across all agents.
 * Mobile equivalent of the web useStreamingAgentId hook (no sessionStorage).
 */
export function useStreamingAgentId(): string | null {
  const [streamingId, setStreamingId] = useState<string | null>(null)

  useAgentEvents(null, (event) => {
    const agentId = (event as { agentId?: string }).agentId ?? null

    if (event.type === "message:start") {
      setStreamingId(agentId)
    }

    if (event.type === "message:chunk" && agentId) {
      setStreamingId((prev) => (prev === agentId ? prev : agentId))
    }

    if (event.type === "message:done") {
      setStreamingId(null)
    }
  })

  return streamingId
}
