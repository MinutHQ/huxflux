import { useCallback } from "react"
import type { ServerEvent } from "../../../ws.js"
import { useAgentEvents } from "../../../ws.js"
import { isAgentStreaming } from "../agents.state.js"
import { useAgentQuery } from "./useAgentQuery.js"
import { useAgentPagination } from "./useAgentPagination.js"
import { useAgentMessageStream } from "./useAgentMessageStream.js"
import { useAgentFileChanges } from "./useAgentFileChanges.js"
import { useAgentTerminal } from "./useAgentTerminal.js"
import { useAgentPendingQuestion } from "./useAgentPendingQuestion.js"
import { useAgentLifecycle } from "./useAgentLifecycle.js"

// Re-export so the existing `index.ts` import surface stays unchanged.
export { configureAgentErrorHandler } from "./errorHandler.js"

/**
 * Composite agent hook. Thin orchestrator over per-concern hooks:
 *
 *   - `useAgentQuery`          single-agent fetch + sub-agent data merge
 *   - `useAgentPagination`     loadMore / hasMore / isLoadingMore
 *   - `useAgentMessageStream`  message + tool + subagent WS events
 *   - `useAgentFileChanges`    `file:changed` frame
 *   - `useAgentTerminal`       `terminal:line` frame
 *   - `useAgentPendingQuestion` `ask:question` frame + clear callback
 *   - `useAgentLifecycle`      `agent:updated`, `ws:reconnected`, `error`
 *
 * Every sub-hook returns a stable `handleEvent` callback. We subscribe ONCE
 * via `useAgentEvents` and dispatch to the right callback by event type.
 * This avoids fan-out subscribe/unsubscribe races in the shared WS layer.
 *
 * Return shape is preserved verbatim for backwards compatibility with the 11
 * existing consumers (`data`, `isStreaming`, `loadMore`, `hasMore`,
 * `isLoadingMore`, `pendingQuestion`, `clearPendingQuestion`, plus everything
 * the underlying React-Query result exposes).
 */
export function useAgent(id: string | null) {
  const { query, subAgentDataRef } = useAgentQuery(id)
  const pagination = useAgentPagination(id, query.data?.hasMore)
  const { handleEvent: handleMessageStreamEvent } = useAgentMessageStream(id, subAgentDataRef)
  const { handleEvent: handleFileChangesEvent } = useAgentFileChanges(id)
  const { handleEvent: handleTerminalEvent } = useAgentTerminal(id)
  const { pendingQuestion, clearPendingQuestion, handleEvent: handlePendingQuestionEvent } = useAgentPendingQuestion()
  const { handleEvent: handleLifecycleEvent } = useAgentLifecycle(id)

  const onEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "message:user":
        case "message:start":
        case "message:chunk":
        case "message:thinking":
        case "tool:call":
        case "tool:result":
        case "message:done":
        case "subagent:event":
          handleMessageStreamEvent(event)
          return
        case "file:changed":
          handleFileChangesEvent(event)
          return
        case "terminal:line":
          handleTerminalEvent(event)
          return
        case "ask:question":
          handlePendingQuestionEvent(event)
          return
        case "agent:updated":
        case "ws:reconnected":
        case "error":
          handleLifecycleEvent(event)
          return
      }
    },
    [handleMessageStreamEvent, handleFileChangesEvent, handleTerminalEvent, handlePendingQuestionEvent, handleLifecycleEvent]
  )

  useAgentEvents(id, onEvent)

  const isStreaming = query.data ? isAgentStreaming(query.data) : false

  return {
    ...query,
    isStreaming,
    loadMore: pagination.loadMore,
    hasMore: pagination.hasMore,
    isLoadingMore: pagination.isLoadingMore,
    pendingQuestion,
    clearPendingQuestion,
  }
}
