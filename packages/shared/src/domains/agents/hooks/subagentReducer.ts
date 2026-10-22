// Reducers for `subagent:update` frames, plus the merge that keeps sub-agent
// state on a tool call when `message:done` replaces the streaming message.
// The server persists every sub-agent tool call and status, so these only
// keep the live cache in step between fetches.

import type { Message, SubagentUpdate, ToolCall } from "../agents.types.js"

function applyToCall(tc: ToolCall, update: SubagentUpdate): ToolCall {
  switch (update.kind) {
    case "toolCall": {
      const subCalls = tc.subCalls ?? []
      if (subCalls.some((s) => s.id === update.toolCall.id)) return tc
      return { ...tc, subCalls: [...subCalls, update.toolCall] }
    }
    case "toolResult":
      return {
        ...tc,
        subCalls: (tc.subCalls ?? []).map((s) => (s.id === update.toolCallId ? { ...s, result: update.result } : s)),
      }
    case "text":
      return { ...tc, outputText: (tc.outputText ?? "") + update.text }
    case "status":
      return {
        ...tc,
        subagentStatus: update.status ?? tc.subagentStatus,
        subagentSummary: update.summary ?? tc.subagentSummary,
        subagentProgress: update.progress ?? tc.subagentProgress,
      }
  }
}

/** Returns the updated list, or null when `toolUseId` is not in this subtree. */
function updateTree(calls: ToolCall[], toolUseId: string, update: SubagentUpdate): ToolCall[] | null {
  for (let i = 0; i < calls.length; i++) {
    const tc = calls[i]
    if (!tc) continue
    let replaced: ToolCall | null = null
    if (tc.id === toolUseId) {
      replaced = applyToCall(tc, update)
    } else if (tc.subCalls && tc.subCalls.length > 0) {
      const subCalls = updateTree(tc.subCalls, toolUseId, update)
      if (subCalls) replaced = { ...tc, subCalls }
    }
    if (replaced) {
      const next = [...calls]
      next[i] = replaced
      return next
    }
  }
  return null
}

/**
 * Apply one sub-agent update to the Agent tool call `toolUseId`, wherever it
 * sits: a top-level tool call, or a sub-call when a sub-agent spawned its own
 * sub-agent. Unknown ids leave the messages untouched.
 */
export function applySubagentUpdate(msgs: Message[], toolUseId: string, update: SubagentUpdate): Message[] {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (!m?.toolCalls || m.toolCalls.length === 0) continue
    const toolCalls = updateTree(m.toolCalls, toolUseId, update)
    if (!toolCalls) continue
    const next = [...msgs]
    next[i] = { ...m, toolCalls }
    return next
  }
  return msgs
}

/**
 * `message:done` carries the runner's view of the tool calls, which has no
 * sub-agent state. Keep what the cache already holds for each call so a
 * finished turn does not blank its sub-agents until the next fetch.
 */
export function carrySubagentState(msgs: Message[], incoming: ToolCall[]): ToolCall[] {
  const existing = new Map<string, ToolCall>()
  for (const m of msgs) {
    for (const tc of m.toolCalls ?? []) existing.set(tc.id, tc)
  }
  return incoming.map((tc) => {
    const prev = existing.get(tc.id)
    if (!prev) return tc
    return {
      ...tc,
      subCalls: tc.subCalls ?? prev.subCalls,
      outputText: tc.outputText ?? prev.outputText,
      subagentStatus: tc.subagentStatus ?? prev.subagentStatus,
      subagentSummary: tc.subagentSummary ?? prev.subagentSummary,
      subagentProgress: tc.subagentProgress ?? prev.subagentProgress,
    }
  })
}
