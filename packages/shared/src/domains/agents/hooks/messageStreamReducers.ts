// Pure message-array reducers for each agent WS event. Extracted from the
// `useAgent` event handler so each reducer fits the 80-line cap and can be
// reasoned about in isolation.
//
// Every function takes `(msgs, event)` and returns the new message array.

import type { Message, ToolCall } from "../agents.types.js"
import type { SubAgentDataMap } from "./subAgentData.js"

type UserEvent = { message: { id: string; role: "user"; content: string; timestamp: string; sender?: string } }

export function applyUserMessage(msgs: Message[], event: UserEvent): Message[] {
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
}

export function applyMessageStart(msgs: Message[], messageId: string): Message[] {
  return [
    ...msgs,
    {
      id: messageId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      toolCalls: [],
    },
  ]
}

function ensureMessage(msgs: Message[], messageId: string, withPending: boolean): Message[] {
  if (msgs.some((m) => m.id === messageId)) return msgs
  const base: Message = {
    id: messageId,
    role: "assistant",
    content: "",
    timestamp: new Date().toISOString(),
    toolCalls: [],
  }
  return [...msgs, withPending ? { ...base, pendingText: "" } : base]
}

export function applyMessageChunk(msgs: Message[], messageId: string, delta: string): Message[] {
  // Stream into pendingText (rendered inside the accordion), not into content.
  // Otherwise the text shows under the bubble first and then jumps into the
  // accordion when the next tool call arrives.
  return ensureMessage(msgs, messageId, true).map((m) =>
    m.id === messageId ? { ...m, pendingText: (m.pendingText ?? "") + delta } : m
  )
}

export function applyMessageThinking(msgs: Message[], messageId: string, delta: string): Message[] {
  return msgs.map((m) =>
    m.id === messageId ? { ...m, thinking: (m.thinking ?? "") + delta } : m
  )
}

export function applyToolCall(msgs: Message[], messageId: string, toolCall: ToolCall): Message[] {
  return ensureMessage(msgs, messageId, false).map((m) => {
    if (m.id !== messageId) return m
    // The pendingText buffer was the text streamed since the last tool call,
    // it now belongs to this tool call. Use the server's value when present,
    // fall back to the local buffer (e.g. if pendingText and event delivery
    // race). Either way, clear the buffer.
    const pre = toolCall.precedingText ?? (m.pendingText || undefined)
    return {
      ...m,
      pendingText: "",
      toolCalls: [...(m.toolCalls ?? []), { ...toolCall, precedingText: pre }],
    }
  })
}

export function applyToolResult(msgs: Message[], messageId: string, toolCallId: string, result: string): Message[] {
  return msgs.map((m) =>
    m.id === messageId
      ? {
          ...m,
          toolCalls: (m.toolCalls ?? []).map((tc) =>
            tc.id === toolCallId ? { ...tc, result } : tc
          ),
        }
      : m
  )
}

export function applyMessageDone(msgs: Message[], messageId: string, message: Message, map: SubAgentDataMap): Message[] {
  const mergedToolCalls = (message.toolCalls ?? []).map((tc) => {
    const sd = map.get(tc.id)
    return sd ? { ...tc, subCalls: sd.subCalls, outputText: sd.outputText } : tc
  })
  // Clear the local pendingText buffer. The server's `content` is now
  // authoritative (it holds whatever text was emitted after the last tool
  // call).
  const merged: Message = { ...message, toolCalls: mergedToolCalls, pendingText: "" }

  // 1. Replace by exact ID (normal case)
  if (msgs.some((m) => m.id === messageId)) {
    return msgs.map((m) => m.id === messageId ? merged : m)
  }
  // 2. Replace the last in-progress assistant message if ID not found.
  //    This handles the case where the cache was refreshed (background
  //    refetch / reconnect) and the streaming skeleton has a different
  //    reference, preventing a duplicate message from being appended.
  const inProgressIdx = msgs.findLastIndex((m) => m.role === "assistant" && m.durationMs == null)
  if (inProgressIdx !== -1) {
    const next = [...msgs]
    next[inProgressIdx] = merged
    return next
  }
  // 3. Replace an optimistic placeholder
  const optimisticIdx = msgs.findLastIndex(
    (m) => m.id.startsWith("optimistic-") && m.role === message.role
  )
  if (optimisticIdx !== -1) {
    const next = [...msgs]
    next[optimisticIdx] = merged
    return next
  }
  return [...msgs, merged]
}
