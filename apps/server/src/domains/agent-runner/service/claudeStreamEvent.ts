import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { toolCalls as toolCallsTable, agents as agentsTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import { setPendingQuestion } from "../../../askStore.js"
import type { ToolCall } from "../../../types.js"
import type { ClaudeStreamEvent, StreamState } from "../../agents/agents.types.js"

/** Process one Claude-format stream event and update streaming state + DB. */
export function handleStreamEvent(
  event: ClaudeStreamEvent,
  state: StreamState,
  agentId: string,
  messageId: string,
  scheduleFlush: () => void,
): void {
  // Sub-agent events carry parent_tool_use_id — route them before any type checks
  // so they don't get processed as parent content/tool-calls.
  if (event.parent_tool_use_id) {
    const toolUseId = event.parent_tool_use_id
    agentsWs.subagentEvent(agentId, toolUseId, event as unknown as Record<string, unknown>)
    agentsWs.terminalLine(agentId, `[stream] ${JSON.stringify(event)}`)
    return
  }

  if (event.type === "assistant" && event.message) {
    handleAssistantBlocks(event.message.content, state, agentId, messageId, scheduleFlush)
  } else if (event.type === "tool_result" && event.tool_use_id) {
    handleToolResult(event.tool_use_id, event.content ?? "", state, agentId, messageId)
  } else if (event.type === "result" && event.usage) {
    state.inputTokens = event.usage.input_tokens ?? null
    state.outputTokens = event.usage.output_tokens ?? null
    state.cacheReadTokens = event.usage.cache_read_input_tokens ?? null
    state.cacheWriteTokens = event.usage.cache_creation_input_tokens ?? null
  } else if (event.type === "system" && event.subtype === "init" && event.session_id) {
    db.update(agentsTable)
      .set({ sessionId: event.session_id })
      .where(eq(agentsTable.id, agentId))
      .run()
  } else if (event.type !== "system") {
    // Forward unrecognized events (likely sub-agent activity) to frontend.
    const toolUseId = event.parent_tool_use_id ?? event.tool_use_id ?? ""
    agentsWs.subagentEvent(agentId, toolUseId, event as unknown as Record<string, unknown>)
    agentsWs.terminalLine(agentId, `[stream] ${JSON.stringify(event)}`)
  }
}

function handleToolResult(
  toolUseId: string,
  content: string,
  state: StreamState,
  agentId: string,
  messageId: string,
): void {
  const tc = state.collectedToolCalls.find((t) => t.id === toolUseId)
  if (tc) tc.result = content
  // Persist tool result to DB immediately
  db.update(toolCallsTable)
    .set({ result: content })
    .where(eq(toolCallsTable.id, toolUseId))
    .run()
  agentsWs.toolResult(agentId, messageId, toolUseId, content)
}

function handleAssistantBlocks(
  blocks: import("../../agents/agents.types.js").ClaudeContentBlock[],
  state: StreamState,
  agentId: string,
  messageId: string,
  scheduleFlush: () => void,
): void {
  for (const block of blocks) {
    if (block.type === "text") {
      // Stream the chunk to the client right away (it appends to msg.content
      // optimistically). If a tool_use follows, the client will move this
      // text out of msg.content into the tool call's precedingText.
      state.pendingText += block.text
      state.fullContent += block.text
      agentsWs.messageChunk(agentId, messageId, block.text)
      scheduleFlush()
    } else if (block.type === "thinking") {
      state.fullThinking += block.thinking
      agentsWs.messageThinking(agentId, messageId, block.thinking)
      scheduleFlush()
    } else if (block.type === "tool_use") {
      recordToolUse(block, state, agentId, messageId)
    }
  }
}

function recordToolUse(
  block: { id: string; name: string; input: unknown },
  state: StreamState,
  agentId: string,
  messageId: string,
): void {
  const precedingText = state.pendingText || undefined
  state.pendingText = ""
  const tc: ToolCall = {
    id: block.id,
    tool: block.name,
    args: JSON.stringify(block.input),
    precedingText,
  }
  state.collectedToolCalls.push({
    id: block.id,
    tool: block.name,
    args: JSON.stringify(block.input),
    precedingText,
  })
  state.toolCallOrderIdx++
  // Persist tool call to DB immediately so it survives reloads
  try {
    db.insert(toolCallsTable).values({
      id: block.id,
      messageId,
      tool: block.name,
      args: JSON.stringify(block.input),
      orderIdx: state.toolCallOrderIdx - 1,
      precedingText,
    }).run()
  } catch { /* duplicate ID from provider replaying events */ }
  agentsWs.toolCall(agentId, messageId, tc)

  // Detect AskUserQuestion from the stream and notify the UI directly
  // (no dependency on the hook script for notification).
  if (block.name === "AskUserQuestion") {
    detectAskUserQuestion(block.id, block.input, agentId)
  }
}

function detectAskUserQuestion(toolUseId: string, input: unknown, agentId: string): void {
  try {
    const parsed = input as {
      questions?: Array<{
        question: string
        header?: string
        multiSelect?: boolean
        options?: Array<{ label: string; description?: string }>
      }>
    }
    if (!parsed.questions?.length) return
    setPendingQuestion(agentId, toolUseId)
    agentsWs.askQuestion(agentId, toolUseId, parsed.questions)
  } catch { /* malformed input */ }
}
