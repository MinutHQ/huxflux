import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../api"
import { useAgentEvents } from "../ws"
import { isAgentStreaming } from "../agentState"
import type { Agent, Message, ToolCall } from "../types"

/** Called when the agent emits an error event. Override per platform. */
let _onError: (message: string) => void = (msg) => console.error("[agent error]", msg)

export function configureAgentErrorHandler(fn: (message: string) => void): void {
  _onError = fn
}

// Sub-agent data (subCalls + outputText) is client-side only — not stored in DB.
// We keep it in a ref so it survives React Query cache invalidations / refetches.
interface SubAgentData { subCalls: ToolCall[]; outputText: string }

function mergeSubAgentData(msgs: Message[], map: Map<string, SubAgentData>): Message[] {
  if (map.size === 0) return msgs
  return msgs.map((m) => ({
    ...m,
    toolCalls: (m.toolCalls ?? []).map((tc) => {
      const sd = map.get(tc.id)
      if (!sd) return tc
      return {
        ...tc,
        subCalls: sd.subCalls.length > 0 ? sd.subCalls : tc.subCalls,
        outputText: sd.outputText || tc.outputText,
      }
    }),
  }))
}

export function useAgent(id: string | null) {
  const queryClient = useQueryClient()
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Pending AskUserQuestion from Claude, surfaced in the UI
  const [pendingQuestion, setPendingQuestion] = useState<{
    agentId: string
    toolUseId: string
    questions: Array<{ question: string; header?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }>
  } | null>(null)

  // Persistent client-side sub-agent data, keyed by Agent tool call ID
  const subAgentDataRef = useRef(new Map<string, SubAgentData>())

  // Reset sub-agent cache on agent switch.
  useEffect(() => {
    subAgentDataRef.current = new Map()
  }, [id])

  const query = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
    // Always re-merge client-side subCalls after any server fetch
    select: (data): Agent => {
      const map = subAgentDataRef.current
      if (map.size === 0) return data
      return { ...data, messages: mergeSubAgentData(data.messages, map) }
    },
  })

  // Sync hasMore from fetched data
  useEffect(() => {
    if (query.data?.hasMore !== undefined) {
      setHasMore(query.data.hasMore)
    }
  }, [query.data?.hasMore])

  // Loading state is now a pure derivation from query data — no internal
  // React state, no effects, no polling. The server's streaming flag plus
  // the last message's durationMs are the single source of truth, kept in
  // sync by the runner's finalize path and the /api/agents override.
  const isStreaming = query.data ? isAgentStreaming(query.data) : false

  const loadMore = useCallback(async () => {
    if (!id || isLoadingMore || !hasMore) return
    const msgs = queryClient.getQueryData<Agent>(["agent", id])?.messages
    if (!msgs?.length) return
    const oldest = msgs[0].timestamp
    setIsLoadingMore(true)
    try {
      const older = await api.getMoreMessages(id, oldest)
      if (older.length === 0) { setHasMore(false); return }
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        // Deduplicate by id
        const existingIds = new Set(old.messages.map((m) => m.id))
        const newMsgs = older.filter((m) => !existingIds.has(m.id))
        return { ...old, messages: [...newMsgs, ...old.messages] }
      })
      setHasMore(older.length === 50)
    } finally {
      setIsLoadingMore(false)
    }
  }, [id, isLoadingMore, hasMore, queryClient])

  const updateMessages = useCallback(
    (updater: (msgs: Message[]) => Message[]) => {
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        return { ...old, messages: updater(old.messages) }
      })
    },
    [id, queryClient]
  )

  useAgentEvents(id, (event) => {
    if (event.type === "message:user") {
      updateMessages((msgs) => {
        // Avoid duplicate if already present with real id
        if (msgs.some((m) => m.id === event.message.id)) return msgs
        // Replace optimistic placeholder from the sender
        const optimisticIdx = msgs.findLastIndex(
          (m) => m.id.startsWith("optimistic-") && m.role === "user"
        )
        if (optimisticIdx !== -1) {
          const next = [...msgs]
          next[optimisticIdx] = { ...event.message, toolCalls: [] }
          return next
        }
        return [...msgs, { ...event.message, toolCalls: [] }]
      })
    }

    if (event.type === "message:start") {
      updateMessages((msgs) => [
        ...msgs,
        {
          id: event.messageId,
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
          toolCalls: [],
        },
      ])
    }

    if (event.type === "message:chunk") {
      updateMessages((msgs) => {
        const exists = msgs.some((m) => m.id === event.messageId)
        const withMessage = exists
          ? msgs
          : [
              ...msgs,
              {
                id: event.messageId,
                role: "assistant" as const,
                content: "",
                timestamp: new Date().toISOString(),
                toolCalls: [],
                pendingText: "",
              },
            ]
        // Stream into pendingText (rendered inside the accordion), not into
        // content — otherwise the text shows under the bubble first and then
        // jumps into the accordion when the next tool call arrives.
        return withMessage.map((m) =>
          m.id === event.messageId
            ? { ...m, pendingText: (m.pendingText ?? "") + event.delta }
            : m
        )
      })
    }

    if (event.type === "message:thinking") {
      updateMessages((msgs) =>
        msgs.map((m) =>
          m.id === event.messageId
            ? { ...m, thinking: (m.thinking ?? "") + event.delta }
            : m
        )
      )
    }

    if (event.type === "tool:call") {
      updateMessages((msgs) => {
        const exists = msgs.some((m) => m.id === event.messageId)
        const withMessage = exists
          ? msgs
          : [
              ...msgs,
              {
                id: event.messageId,
                role: "assistant" as const,
                content: "",
                timestamp: new Date().toISOString(),
                toolCalls: [],
              },
            ]
        return withMessage.map((m) => {
          if (m.id !== event.messageId) return m
          // The pendingText buffer was the text streamed since the last tool
          // call — it now belongs to this tool call. Use the server's value
          // when present; fall back to the local buffer (e.g. if pendingText
          // and event delivery race). Either way, clear the buffer.
          const pre = event.toolCall.precedingText ?? (m.pendingText || undefined)
          return {
            ...m,
            pendingText: "",
            toolCalls: [...(m.toolCalls ?? []), { ...event.toolCall, precedingText: pre }],
          }
        })
      })
    }

    if (event.type === "tool:result") {
      updateMessages((msgs) =>
        msgs.map((m) =>
          m.id === event.messageId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.id === event.toolCallId ? { ...tc, result: event.result } : tc
                ),
              }
            : m
        )
      )
    }

    if (event.type === "message:done") {
      updateMessages((msgs) => {
        const map = subAgentDataRef.current
        const incoming = event.message as unknown as Message
        const mergedToolCalls = (incoming.toolCalls ?? []).map((tc) => {
          const sd = map.get(tc.id)
          return sd ? { ...tc, subCalls: sd.subCalls, outputText: sd.outputText } : tc
        })
        // Clear the local pendingText buffer — the server's `content` is now
        // authoritative (it holds whatever text was emitted after the last
        // tool call).
        const merged = { ...incoming, toolCalls: mergedToolCalls, pendingText: "" }

        // 1. Replace by exact ID (normal case)
        if (msgs.some((m) => m.id === event.messageId)) {
          return msgs.map((m) => m.id === event.messageId ? merged : m)
        }

        // 2. Replace the last in-progress assistant message if ID not found.
        //    This handles the case where the cache was refreshed (background
        //    refetch / reconnect) and the streaming skeleton has a different
        //    reference, preventing a duplicate message from being appended.
        const inProgressIdx = msgs.findLastIndex(
          (m) => m.role === "assistant" && m.durationMs == null
        )
        if (inProgressIdx !== -1) {
          const next = [...msgs]
          next[inProgressIdx] = merged
          return next
        }

        // 3. Replace an optimistic placeholder
        const optimisticIdx = msgs.findLastIndex(
          (m: Message) => m.id.startsWith("optimistic-") && m.role === incoming.role
        )
        if (optimisticIdx !== -1) {
          const next = [...msgs]
          next[optimisticIdx] = merged
          return next
        }

        return [...msgs, merged]
      })
    }

    if (event.type === "file:changed") {
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        return { ...old, fileChanges: event.files }
      })
    }

    if (event.type === "terminal:line") {
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        return { ...old, terminalOutput: [...old.terminalOutput, event.line] }
      })
    }

    if (event.type === "subagent:event") {
      const subEvent = event.event as Record<string, unknown>
      if (subEvent.type === "assistant" && subEvent.message) {
        const msg = subEvent.message as { content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> }
        let textChunk = ""
        const newSubCalls: ToolCall[] = []
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            textChunk += block.text
          } else if (block.type === "tool_use" && block.id && block.name) {
            newSubCalls.push({ id: block.id, tool: block.name, args: block.input ? JSON.stringify(block.input) : undefined })
          }
        }
        if (textChunk || newSubCalls.length > 0) {
          // Update the persistent ref so refetches don't lose this data
          const map = subAgentDataRef.current
          const existing = map.get(event.toolUseId) ?? { subCalls: [], outputText: "" }
          map.set(event.toolUseId, {
            subCalls: newSubCalls.length > 0 ? [...existing.subCalls, ...newSubCalls] : existing.subCalls,
            outputText: textChunk ? existing.outputText + textChunk : existing.outputText,
          })
          updateMessages((msgs) =>
            msgs.map((m) => ({
              ...m,
              toolCalls: (m.toolCalls ?? []).map((tc) =>
                (tc.id === event.toolUseId || tc.tool === "Agent")
                  ? {
                      ...tc,
                      subCalls: newSubCalls.length > 0 ? [...(tc.subCalls ?? []), ...newSubCalls] : tc.subCalls,
                      outputText: textChunk ? ((tc.outputText ?? "") + textChunk) : tc.outputText,
                    }
                  : tc
              ),
            }))
          )
        }
      } else if (subEvent.type === "tool_result" && subEvent.tool_use_id) {
        const subToolId = subEvent.tool_use_id as string
        const result = (subEvent.content ?? "") as string
        // Update ref
        for (const [, sd] of subAgentDataRef.current) {
          const sub = sd.subCalls.find((s) => s.id === subToolId)
          if (sub) { sub.result = result; break }
        }
        updateMessages((msgs) =>
          msgs.map((m) => ({
            ...m,
            toolCalls: (m.toolCalls ?? []).map((tc) =>
              tc.tool === "Agent"
                ? {
                    ...tc,
                    subCalls: (tc.subCalls ?? []).map((sub) =>
                      sub.id === subToolId ? { ...sub, result } : sub
                    ),
                  }
                : tc
            ),
          }))
        )
      }
    }

    if (event.type === "ask:question") {
      setPendingQuestion({ agentId: event.agentId, toolUseId: event.toolUseId, questions: event.questions })
    }

    if (event.type === "error") {
      _onError(event.message)
    }

    if (event.type === "agent:updated") {
      // Guard: only apply updates for the agent this hook is watching.
      // agent:updated events are broadcast for ALL agents and the useAgentEvents
      // filter doesn't catch them (no top-level agentId field), so without this
      // check a newly-created agent B would overwrite agent A's cache entry.
      if (event.agent.id !== id) return
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        return { ...old, ...event.agent }
      })
    }

    if (event.type === "ws:reconnected") {
      queryClient.invalidateQueries({ queryKey: ["agent", id] })
    }
  })

  return { ...query, isStreaming, loadMore, hasMore, isLoadingMore, pendingQuestion, clearPendingQuestion: () => setPendingQuestion(null) }
}
