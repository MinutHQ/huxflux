import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent, AgentsServerEvent, Message } from "../agents.types.js"
import type { SubAgentDataMap } from "./subAgentData.js"
import {
  applyMessageChunk,
  applyMessageDone,
  applyMessageStart,
  applyMessageThinking,
  applyToolCall,
  applyToolResult,
  applyUserMessage,
} from "./messageStreamReducers.js"
import {
  applySubAgentAssistant,
  applySubAgentToolResult,
  classifySubAgentEvent,
  recordSubAgentAssistant,
  recordSubAgentToolResult,
} from "./subagentEventReducer.js"

type StreamEvent = Extract<AgentsServerEvent,
  | { type: "message:user" }
  | { type: "message:start" }
  | { type: "message:chunk" }
  | { type: "message:thinking" }
  | { type: "tool:call" }
  | { type: "tool:result" }
  | { type: "message:done" }
  | { type: "subagent:event" }
>

/**
 * Handler for the message / tool / subagent stream. Owns the cache writes for
 * every `message:*`, `tool:*`, and `subagent:event` WS frame.
 *
 * Returns a stable `handleEvent` callback that the orchestrator wires into
 * the single shared `useAgentEvents` subscription. `subAgentDataRef` is owned
 * by the query hook and threaded through so refetches don't drop sub-call
 * state.
 */
export function useAgentMessageStream(id: string | null, subAgentDataRef: { current: SubAgentDataMap }) {
  const queryClient = useQueryClient()

  const updateMessages = useCallback(
    (updater: (msgs: Message[]) => Message[]) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(id), (old) => {
        if (!old) return old
        return { ...old, messages: updater(old.messages) }
      })
    },
    [id, queryClient]
  )

  const handleSubagent = useCallback(
    (event: Extract<StreamEvent, { type: "subagent:event" }>) => {
      const result = classifySubAgentEvent(event.event as { type: string })
      if (result.kind === "ignore") return
      if (result.kind === "assistant") {
        recordSubAgentAssistant(subAgentDataRef.current, event.toolUseId, result.update)
        updateMessages((msgs) => applySubAgentAssistant(msgs, event.toolUseId, result.update))
        return
      }
      recordSubAgentToolResult(subAgentDataRef.current, result.toolUseId, result.result)
      updateMessages((msgs) => applySubAgentToolResult(msgs, result.toolUseId, result.result))
    },
    [subAgentDataRef, updateMessages]
  )

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      if (event.type === "message:user") {
        updateMessages((msgs) => applyUserMessage(msgs, event))
      } else if (event.type === "message:start") {
        updateMessages((msgs) => applyMessageStart(msgs, event.messageId))
      } else if (event.type === "message:chunk") {
        updateMessages((msgs) => applyMessageChunk(msgs, event.messageId, event.delta))
      } else if (event.type === "message:thinking") {
        updateMessages((msgs) => applyMessageThinking(msgs, event.messageId, event.delta))
      } else if (event.type === "tool:call") {
        updateMessages((msgs) => applyToolCall(msgs, event.messageId, event.toolCall))
      } else if (event.type === "tool:result") {
        updateMessages((msgs) => applyToolResult(msgs, event.messageId, event.toolCallId, event.result))
      } else if (event.type === "message:done") {
        const map = subAgentDataRef.current
        const incoming = event.message as unknown as Message
        updateMessages((msgs) => applyMessageDone(msgs, event.messageId, incoming, map))
      } else if (event.type === "subagent:event") {
        handleSubagent(event)
      }
    },
    [updateMessages, handleSubagent, subAgentDataRef]
  )

  return { handleEvent }
}

export type { StreamEvent }
