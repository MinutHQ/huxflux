import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { api } from "../api"
import { useAgentEvents } from "../ws"
import type { Agent, Message, ToolCall } from "../types"

/** Called when the agent emits an error event. Override per platform. */
let _onError: (message: string) => void = (msg) => console.error("[agent error]", msg)

export function configureAgentErrorHandler(fn: (message: string) => void): void {
  _onError = fn
}

export function useAgent(id: string | null) {
  const queryClient = useQueryClient()
  const [isStreaming, setIsStreaming] = useState(false)

  const query = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id,
    staleTime: 10_000,
  })

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
    if (event.type === "message:start") {
      setIsStreaming(true)
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
      setIsStreaming(true)
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
        return withMessage.map((m) =>
          m.id === event.messageId ? { ...m, content: m.content + event.delta } : m
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
        return withMessage.map((m) =>
          m.id === event.messageId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), event.toolCall] }
            : m
        )
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
        const exists = msgs.some((m) => m.id === event.messageId)
        if (exists) {
          return msgs.map((m) => {
            if (m.id !== event.messageId) return m
            const incoming = event.message
            // Preserve accumulated subCalls from sub-agent events
            const existingSubCalls = new Map<string, ToolCall[]>()
            for (const tc of m.toolCalls ?? []) {
              if (tc.subCalls && tc.subCalls.length > 0) existingSubCalls.set(tc.id, tc.subCalls)
            }
            if (existingSubCalls.size > 0 && incoming.toolCalls) {
              incoming.toolCalls = incoming.toolCalls.map((tc) => {
                const subs = existingSubCalls.get(tc.id)
                return subs ? { ...tc, subCalls: subs } : tc
              })
            }
            return incoming
          })
        }
        const incoming = event.message as unknown as Message
        const optimisticIdx = msgs.findLastIndex(
          (m: Message) => m.id.startsWith("optimistic-") && m.role === incoming.role
        )
        if (optimisticIdx !== -1) {
          const next = [...msgs]
          next[optimisticIdx] = incoming
          return next
        }
        return [...msgs, incoming]
      })
      setIsStreaming(false)
      queryClient.invalidateQueries({ queryKey: ["agent", id] })
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
      // Convert sub-agent events into subCalls on the matching Agent tool call
      if (subEvent.type === "assistant" && subEvent.message) {
        const msg = subEvent.message as { content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> }
        for (const block of msg.content) {
          if (block.type === "tool_use" && block.id && block.name) {
            const subCall: ToolCall = { id: block.id, tool: block.name, args: block.input ? JSON.stringify(block.input) : undefined }
            updateMessages((msgs) =>
              msgs.map((m) => ({
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  (tc.id === event.toolUseId || tc.tool === "Agent")
                    ? { ...tc, subCalls: [...(tc.subCalls ?? []), subCall] }
                    : tc
                ),
              }))
            )
          }
        }
      } else if (subEvent.type === "tool_result" && subEvent.tool_use_id) {
        const subToolId = subEvent.tool_use_id as string
        const result = (subEvent.content ?? "") as string
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

    if (event.type === "error") {
      setIsStreaming(false)
      _onError(event.message)
    }

    if (event.type === "agent:updated") {
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        return { ...old, ...event.agent }
      })
    }
  })

  return { ...query, isStreaming }
}
