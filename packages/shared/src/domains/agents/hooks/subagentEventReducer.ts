// Reducers for `subagent:event` frames. The server forwards raw Anthropic SDK
// events from sub-agent invocations. We extract the bits we care about
// (assistant text + tool_use + tool_result) and fan them out into:
//   1. The persistent `subAgentDataRef` map (so refetches don't drop them)
//   2. The owning Agent tool call's `subCalls` / `outputText`
//
// Pure helpers so the orchestrating hook stays small. The split-out signature
// passes the persistent map by reference because we mutate it in place (it's
// the source of truth between server fetches).

import type { Message, ToolCall } from "../agents.types.js"
import type { SubAgentDataMap } from "./subAgentData.js"

interface AssistantBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

interface AssistantSubEvent {
  type: "assistant"
  message: { content: AssistantBlock[] }
}

interface ToolResultSubEvent {
  type: "tool_result"
  tool_use_id: string
  content?: string
}

type SubEvent = AssistantSubEvent | ToolResultSubEvent | { type: string; [k: string]: unknown }

export interface SubAgentAssistantUpdate {
  textChunk: string
  newSubCalls: ToolCall[]
}

function extractAssistantUpdate(msg: AssistantSubEvent["message"]): SubAgentAssistantUpdate {
  let textChunk = ""
  const newSubCalls: ToolCall[] = []
  for (const block of msg.content) {
    if (block.type === "text" && block.text) {
      textChunk += block.text
    } else if (block.type === "tool_use" && block.id && block.name) {
      newSubCalls.push({
        id: block.id,
        tool: block.name,
        args: block.input ? JSON.stringify(block.input) : undefined,
      })
    }
  }
  return { textChunk, newSubCalls }
}

/** Returns the in-place-updated map entry for the given toolUseId. */
export function recordSubAgentAssistant(
  map: SubAgentDataMap,
  toolUseId: string,
  update: SubAgentAssistantUpdate,
): void {
  const existing = map.get(toolUseId) ?? { subCalls: [], outputText: "" }
  map.set(toolUseId, {
    subCalls: update.newSubCalls.length > 0
      ? [...existing.subCalls, ...update.newSubCalls]
      : existing.subCalls,
    outputText: update.textChunk
      ? existing.outputText + update.textChunk
      : existing.outputText,
  })
}

export function applySubAgentAssistant(
  msgs: Message[],
  toolUseId: string,
  update: SubAgentAssistantUpdate,
): Message[] {
  const { textChunk, newSubCalls } = update
  return msgs.map((m) => ({
    ...m,
    toolCalls: (m.toolCalls ?? []).map((tc) =>
      (tc.id === toolUseId || tc.tool === "Agent")
        ? {
            ...tc,
            subCalls: newSubCalls.length > 0
              ? [...(tc.subCalls ?? []), ...newSubCalls]
              : tc.subCalls,
            outputText: textChunk ? ((tc.outputText ?? "") + textChunk) : tc.outputText,
          }
        : tc
    ),
  }))
}

export function recordSubAgentToolResult(
  map: SubAgentDataMap,
  toolUseId: string,
  result: string,
): void {
  for (const [, sd] of map) {
    const sub = sd.subCalls.find((s) => s.id === toolUseId)
    if (sub) { sub.result = result; break }
  }
}

export function applySubAgentToolResult(
  msgs: Message[],
  toolUseId: string,
  result: string,
): Message[] {
  return msgs.map((m) => ({
    ...m,
    toolCalls: (m.toolCalls ?? []).map((tc) =>
      tc.tool === "Agent"
        ? {
            ...tc,
            subCalls: (tc.subCalls ?? []).map((sub) =>
              sub.id === toolUseId ? { ...sub, result } : sub
            ),
          }
        : tc
    ),
  }))
}

/** Returns a discriminator for the orchestrator to branch on. */
export function classifySubAgentEvent(event: SubEvent):
  | { kind: "assistant"; update: SubAgentAssistantUpdate }
  | { kind: "tool_result"; toolUseId: string; result: string }
  | { kind: "ignore" } {
  if (event.type === "assistant" && (event as AssistantSubEvent).message) {
    const update = extractAssistantUpdate((event as AssistantSubEvent).message)
    if (update.textChunk || update.newSubCalls.length > 0) {
      return { kind: "assistant", update }
    }
    return { kind: "ignore" }
  }
  if (event.type === "tool_result" && (event as ToolResultSubEvent).tool_use_id) {
    const e = event as ToolResultSubEvent
    return { kind: "tool_result", toolUseId: e.tool_use_id, result: (e.content ?? "") as string }
  }
  return { kind: "ignore" }
}
