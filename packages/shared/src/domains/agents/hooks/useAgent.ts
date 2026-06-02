import { useCallback, useState, useEffect } from "react"
import type { ServerEvent } from "../../../ws.js"
import { useAgentEvents } from "../../../ws.js"
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

  // Streaming state: initialized from server data, then driven by WS events.
  // message:start → true, message:done → false.
  // The DB flag (agent.streaming) is only used for the initial value on page
  // load and on reconnect (in case any WS events were missed while offline).
  const [isStreaming, setIsStreaming] = useState(() => !!query.data?.streaming)

  // Sync initial value when query data arrives (first load or reconnect).
  // The proper long-term fix is to make `streaming` a derived value off
  // `query.data.streaming` with WS handlers writing through the query cache
  // via `queryClient.setQueryData`, eliminating the need for local state at
  // all. Out of scope for this PR; tracked separately.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query.data) setIsStreaming(!!query.data.streaming)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.streaming])

  const onEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "message:start":
          setIsStreaming(true)
          handleMessageStreamEvent(event)
          return
        case "message:done":
          setIsStreaming(false)
          handleMessageStreamEvent(event)
          return
        case "message:user":
        case "message:chunk":
        case "message:thinking":
        case "tool:call":
        case "tool:result":
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
          // Sync streaming from server broadcast (covers stop, crash, queue drain)
          if ("agent" in event && event.agent) {
            setIsStreaming(!!event.agent.streaming)
          }
          handleLifecycleEvent(event)
          return
        case "ws:reconnected":
        case "error":
          handleLifecycleEvent(event)
          return
      }
    },
    [handleMessageStreamEvent, handleFileChangesEvent, handleTerminalEvent, handlePendingQuestionEvent, handleLifecycleEvent]
  )

  useAgentEvents(id, onEvent)

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
