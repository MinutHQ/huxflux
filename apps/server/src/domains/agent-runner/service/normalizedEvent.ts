import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { toolCalls as toolCallsTable, agents as agentsTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type { ToolCall } from "../../../types.js"
import type { NormalizedStreamEvent } from "../../providers/providers.types.js"
import type { StreamState } from "../../agents/agents.types.js"

/** Handle a provider-agnostic normalized stream event */
export function handleNormalizedEvent(
  event: NormalizedStreamEvent,
  state: StreamState,
  agentId: string,
  messageId: string,
  scheduleFlush: () => void,
): void {
  switch (event.type) {
    case "text":
      state.pendingText += event.text
      state.fullContent += event.text
      agentsWs.messageChunk(agentId, messageId, event.text)
      scheduleFlush()
      break
    case "thinking":
      state.fullThinking += event.text
      agentsWs.messageThinking(agentId, messageId, event.text)
      scheduleFlush()
      break
    case "tool_use": {
      const precedingText = state.pendingText || undefined
      state.pendingText = ""
      const tc: ToolCall = { id: event.id, tool: event.name, args: JSON.stringify(event.input), precedingText }
      state.collectedToolCalls.push({ id: event.id, tool: event.name, args: JSON.stringify(event.input), precedingText })
      state.toolCallOrderIdx++
      try {
        db.insert(toolCallsTable).values({
          id: event.id, messageId, tool: event.name,
          args: JSON.stringify(event.input), orderIdx: state.toolCallOrderIdx - 1, precedingText,
        }).run()
      } catch { /* duplicate ID from provider replaying events */ }
      agentsWs.toolCall(agentId, messageId, tc)
      break
    }
    case "tool_result": {
      const tc = state.collectedToolCalls.find((t) => t.id === event.toolUseId)
      if (tc) tc.result = event.content
      if (event.toolUseId) {
        db.update(toolCallsTable).set({ result: event.content }).where(eq(toolCallsTable.id, event.toolUseId)).run()
      }
      agentsWs.toolResult(agentId, messageId, event.toolUseId, event.content)
      break
    }
    case "usage":
      state.inputTokens = event.inputTokens ?? null
      state.outputTokens = event.outputTokens ?? null
      state.cacheReadTokens = event.cacheReadTokens ?? null
      state.cacheWriteTokens = event.cacheWriteTokens ?? null
      break
    case "session_init":
      db.update(agentsTable).set({ sessionId: event.sessionId }).where(eq(agentsTable.id, agentId)).run()
      break
    case "subagent":
      agentsWs.subagentEvent(agentId, event.toolUseId, event.event)
      break
    case "error":
      // Surface errors as message content so the user sees them
      state.pendingText += `\n\nError: ${event.message}`
      state.fullContent += `\n\nError: ${event.message}`
      agentsWs.messageChunk(agentId, messageId, `\n\nError: ${event.message}`)
      agentsWs.errorEmit(agentId, event.message)
      break
  }
}
