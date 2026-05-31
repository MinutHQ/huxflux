// Sub-agent data (subCalls + outputText) is client-side only, not stored in
// the DB. The owning Agent tool call's `subCalls` array is reconstructed from
// streamed `subagent:event` frames on the client, then merged into the
// React-Query cache on every read (via `select`) and on `message:done`.
//
// This module exposes the shared shape + a pure merge helper so the query
// hook and the message-stream hook can collaborate around the same ref
// without depending on each other.

import type { Message, ToolCall } from "../agents.types.js"

export interface SubAgentData {
  subCalls: ToolCall[]
  outputText: string
}

export type SubAgentDataMap = Map<string, SubAgentData>

export function mergeSubAgentData(msgs: Message[], map: SubAgentDataMap): Message[] {
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
