import type { StreamState } from "../../agents/agents.types.js"

export const STATUS_PRESERVED_DURING_RUN = ["in-review", "draft-pr", "done", "cancelled"]

/** Construct a fresh streaming-state accumulator for a new assistant turn. */
export function createStreamState(): StreamState {
  return {
    pendingText: "",
    fullContent: "",
    fullThinking: "",
    collectedToolCalls: [],
    toolCallOrderIdx: 0,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
  }
}
