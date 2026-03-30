import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { api } from "@/lib/api"
import { useAgentEvents } from "@/lib/ws"
import type { Agent, Message, ToolCall } from "@/data/mock"

export function useAgent(id: string | null) {
  const queryClient = useQueryClient()
  const [isStreaming, setIsStreaming] = useState(false)

  const query = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id,
    staleTime: 10_000,
  })

  const updateMessages = useCallback((updater: (msgs: Message[]) => Message[]) => {
    queryClient.setQueryData<Agent>(["agent", id], (old) => {
      if (!old) return old
      return { ...old, messages: updater(old.messages) }
    })
  }, [id, queryClient])

  useAgentEvents(id, (event) => {
    if (event.type === "message:start") {
      setIsStreaming(true)
      // Insert a blank in-progress assistant message
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
      updateMessages((msgs) =>
        msgs.map((m) =>
          m.id === event.messageId ? { ...m, content: m.content + event.delta } : m
        )
      )
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
      updateMessages((msgs) =>
        msgs.map((m) =>
          m.id === event.messageId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), event.toolCall as unknown as ToolCall] }
            : m
        )
      )
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
          return msgs.map((m) => m.id === event.messageId ? (event.message as unknown as Message) : m)
        }
        // Also replace any optimistic message with the same content/role
        const incoming = event.message as unknown as Message
        const optimisticIdx = msgs.findLastIndex(
          (m) => m.id.startsWith("optimistic-") && m.role === incoming.role
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
        return { ...old, fileChanges: event.files as Agent["fileChanges"] }
      })
    }

    if (event.type === "terminal:line") {
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        return { ...old, terminalOutput: [...old.terminalOutput, event.line] }
      })
    }

    if (event.type === "agent:updated") {
      queryClient.setQueryData<Agent>(["agent", id], (old) => {
        if (!old) return old
        return { ...old, ...(event.agent as Partial<Agent>) }
      })
    }
  })

  return { ...query, isStreaming }
}
