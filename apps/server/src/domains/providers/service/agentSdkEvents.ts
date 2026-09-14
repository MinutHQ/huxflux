// Pure mapping from Claude Agent SDK messages to NormalizedStreamEvents.
// No I/O, no side effects — the adapter's runTurn loop and parseStreamLine
// both go through here so the mapping is tested once.

import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk"
import type { NormalizedStreamEvent } from "../providers.types.js"

interface RawBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
}

/** Prompt size of one model call: everything the model read, cached or not. */
export function promptTokensOf(message: SDKMessage): number | null {
  if (message.type !== "assistant") return null
  const usage = message.message.usage
  if (!usage) return null
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
}

/**
 * Map one SDK message to zero or more normalized events.
 *
 * `contextTokens` is the prompt size of the last main-loop model call, tracked
 * by the caller across messages; it rides on the final `usage` event so the
 * UI's context meter reflects the real context rather than the turn total.
 */
export function mapSdkMessage(message: SDKMessage, contextTokens: number | null): NormalizedStreamEvent[] {
  const parentToolUseId = (message as { parent_tool_use_id?: string | null }).parent_tool_use_id
  if (parentToolUseId) {
    return [{ type: "subagent", toolUseId: parentToolUseId, event: message as unknown as Record<string, unknown> }]
  }

  switch (message.type) {
    case "system":
      return message.subtype === "init" && message.session_id
        ? [{ type: "session_init", sessionId: message.session_id }]
        : []
    case "assistant":
      return mapAssistantBlocks(message.message.content as unknown as RawBlock[])
    case "user":
      return mapUserBlocks(message.message.content)
    case "result":
      return mapResult(message, contextTokens)
    default:
      return []
  }
}

function mapAssistantBlocks(blocks: RawBlock[] | undefined): NormalizedStreamEvent[] {
  if (!Array.isArray(blocks)) return []
  const events: NormalizedStreamEvent[] = []
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      events.push({ type: "text", text: block.text })
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      events.push({ type: "thinking", text: block.thinking })
    } else if (block.type === "tool_use") {
      events.push({ type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: block.input })
    }
  }
  return events
}

function mapUserBlocks(content: unknown): NormalizedStreamEvent[] {
  // Tool results come back as user-role messages. Text blocks are echoes of
  // prompts the server already persisted, so only tool_result blocks matter.
  if (!Array.isArray(content)) return []
  const events: NormalizedStreamEvent[] = []
  for (const block of content as RawBlock[]) {
    if (block.type !== "tool_result" || !block.tool_use_id) continue
    events.push({ type: "tool_result", toolUseId: block.tool_use_id, content: toolResultContentToString(block.content) })
  }
  return events
}

/** tool_result content is either a plain string or an array of text blocks. */
function toolResultContentToString(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
    .join("")
}

function mapResult(message: SDKResultMessage, contextTokens: number | null): NormalizedStreamEvent[] {
  const usage = message.usage
  const events: NormalizedStreamEvent[] = [{
    type: "usage",
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    cacheReadTokens: usage?.cache_read_input_tokens,
    cacheWriteTokens: usage?.cache_creation_input_tokens,
    contextTokens: contextTokens ?? undefined,
    contextWindow: pickContextWindow(message.modelUsage) ?? undefined,
  }]
  if (message.subtype !== "success") {
    const detail = "errors" in message && Array.isArray(message.errors) && message.errors.length > 0
      ? message.errors.join("; ")
      : message.subtype
    events.push({ type: "error", message: detail })
  } else if (message.is_error) {
    events.push({ type: "error", message: message.result })
  }
  events.push({ type: "done", result: message.subtype === "success" ? message.result : undefined })
  return events
}

/** Largest context window across the models used in the turn (main model dominates). */
function pickContextWindow(modelUsage: Record<string, { contextWindow?: number }> | undefined): number | null {
  if (!modelUsage) return null
  let max = 0
  for (const entry of Object.values(modelUsage)) {
    if (entry.contextWindow && entry.contextWindow > max) max = entry.contextWindow
  }
  return max > 0 ? max : null
}
