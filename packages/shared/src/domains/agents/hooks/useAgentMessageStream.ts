import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent, AgentsServerEvent, Message } from "../agents.types.js"
import {
  applyMessageChunk,
  applyMessageDone,
  applyMessageStart,
  applyMessageThinking,
  applyToolCall,
  applyToolResult,
  applyUserMessage,
} from "./messageStreamReducers.js"
import { applySubagentUpdate } from "./subagentReducer.js"

type StreamEvent = Extract<AgentsServerEvent,
  | { type: "message:user" }
  | { type: "message:start" }
  | { type: "message:chunk" }
  | { type: "message:thinking" }
  | { type: "tool:call" }
  | { type: "tool:result" }
  | { type: "message:done" }
  | { type: "subagent:update" }
>

/**
 * Handler for the message / tool / subagent stream. Owns the cache writes for
 * every `message:*`, `tool:*`, and `subagent:update` WS frame.
 *
 * Returns a stable `handleEvent` callback that the orchestrator wires into
 * the single shared `useAgentEvents` subscription.
 */
export function useAgentMessageStream(id: string | null) {
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
        const incoming = event.message as unknown as Message
        updateMessages((msgs) => applyMessageDone(msgs, event.messageId, incoming))
      } else if (event.type === "subagent:update") {
        updateMessages((msgs) => applySubagentUpdate(msgs, event.toolUseId, event.update))
      }
    },
    [updateMessages]
  )

  return { handleEvent }
}

export type { StreamEvent }
