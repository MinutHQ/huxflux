// Server-side types specific to the agents domain.

// ── Claude CLI stream event shape ──────────────────────────────────────────
//
// The Claude CLI emits newline-delimited JSON events on stdout. The union
// below covers every variant the runner inspects. Fields are derived from the
// runner's accesses (event.type === "assistant", event.message.content, etc.).
// Additional fields the CLI emits but the runner doesn't use are intentionally
// omitted to keep the type tight.

export interface ClaudeTextBlock {
  type: "text"
  text: string
}

export interface ClaudeThinkingBlock {
  type: "thinking"
  thinking: string
}

export interface ClaudeToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: unknown
}

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeThinkingBlock | ClaudeToolUseBlock

export interface ClaudeUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * A single newline-delimited JSON event emitted by the Claude CLI on stdout.
 *
 * Modelled as one interface (not a discriminated union) because the CLI emits
 * several event variants we forward without modelling individually (ping,
 * content-block-start, etc.). The runner dispatches by `type` and only reads
 * the fields the matched branch promises; unmatched events fall through to a
 * generic forward-to-subagent path.
 *
 * Field shapes are derived from the runner's accesses, NOT from the CLI's
 * public schema. If the CLI adds a field the runner needs, add it here.
 */
export interface ClaudeStreamEvent {
  type: string
  /** Sub-agent routing — when present, the event belongs to a sub-agent run. */
  parent_tool_use_id?: string | null
  tool_use_id?: string | null
  /** Present on `type: "assistant"` events. */
  message?: { content: ClaudeContentBlock[] }
  /** Present on `type: "tool_result"` events. */
  content?: string
  /** Present on `type: "result"` events. */
  usage?: ClaudeUsage
  /** Present on `type: "system"` init events. */
  subtype?: string
  session_id?: string
}

// ── Runner-internal types ──────────────────────────────────────────────────

export interface RunnerOptions {
  agentId: string
  worktreePath: string
  model?: string
  planMode?: boolean
  delegateFrom?: string  // parent agent ID when this run was delegated
  sender?: string        // display name for the sender (for delegated messages)
  provider?: string      // provider ID (defaults to agent's provider or "claude")
  effort?: string        // effort level (e.g. "low", "medium", "high", "max")
  taskContext?: string   // appended to system prompt for task-aware agents (refinement)
}

export interface CollectedToolCall {
  id: string
  tool: string
  args?: string
  result?: string
  precedingText?: string
}

export interface StreamState {
  // Text emitted since the last tool call (or message start). On every
  // tool_use it gets attached to that tool call's `precedingText` and reset.
  // Whatever's left at message end becomes the message's final `content`.
  pendingText: string
  // All text across the entire message (never reset). Used by plan mode
  // to surface the full plan as msg.content regardless of tool calls.
  fullContent: string
  fullThinking: string
  collectedToolCalls: CollectedToolCall[]
  toolCallOrderIdx: number
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
}

export interface QueuedMessage {
  content: string
  worktreePath: string
  model: string
  planMode?: boolean
  sender?: string
  delegateFrom?: string
  provider?: string
  effort?: string
}

// ── Slash commands ─────────────────────────────────────────────────────────

export interface SlashCommand {
  name: string
  description: string
  args?: string
  source: "builtin" | "skill"
}
