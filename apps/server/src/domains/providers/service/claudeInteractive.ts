import { execFileSync } from "node:child_process"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"
import { createBinaryResolver } from "./binary.js"

interface ClaudeRawBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
}

interface ClaudeRawEvent {
  type?: string
  subtype?: string
  parent_tool_use_id?: string
  tool_use_id?: string
  session_id?: string
  content?: unknown
  message?: { content?: ClaudeRawBlock[] }
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

/**
 * Claude Interactive provider — uses `claude-p` (npx claude-p) to drive
 * Claude in interactive mode while getting the same stream-json output
 * as `claude -p`. This avoids the -p pricing tier.
 *
 * Install: npm install -g claude-p
 *
 * claude-p creates a PTY, answers Ink's terminal queries, injects the
 * prompt via a SessionStart hook, and reads the transcript for output.
 * Output is byte-for-byte compatible with `claude -p --output-format stream-json`.
 */

const MODEL_ALIASES: Record<string, string> = {
  "Opus 4.7": "claude-opus-4-7",
  "Opus 4.6": "claude-opus-4-6",
  "Sonnet 4.6": "claude-sonnet-4-6",
  "Haiku 4.5": "claude-haiku-4-5",
}

const MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7", api: "claude-opus-4-7" },
  { id: "claude-opus-4-6", label: "Opus 4.6", api: "claude-opus-4-6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", api: "claude-sonnet-4-6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", api: "claude-haiku-4-5-20251001" },
]

const binary = createBinaryResolver({
  defaultBin: "claude-p",
  envVar: "CLAUDE_P_BIN",
  fallbackBin: "npx",
  extraAvailabilityCheck: () => {
    try {
      execFileSync("npx", ["claude-p", "--help"], { encoding: "utf8", timeout: 10_000 })
      return true
    } catch {
      return false
    }
  },
})

export const claudeInteractiveProvider: ProviderAdapter = {
  id: "claude-interactive",
  name: "Claude (Interactive)",

  capabilities: {
    sessionResume: true,
    sessionContinue: true,
    planMode: true,
    streamingJson: true,
    toolUseEvents: true,
    thinkingBlocks: true,
    askUserQuestion: true,
    systemPromptFlag: true,
    allowedToolsRestriction: true,
    subAgentSupport: true,
    effortLevels: ["low", "medium", "high", "max"],
  } satisfies ProviderCapabilities,

  resolveBinary: binary.resolve,
  isAvailable: binary.isAvailable,

  buildSpawnArgs(opts: SpawnOptions): SpawnResult {
    const bin = this.resolveBinary()
    const model = this.resolveModel(opts.model)

    // Session management
    let resumeArgs: string[] = []
    if (opts.sessionId) {
      resumeArgs = ["--resume", opts.sessionId]
    } else if (opts.isContinuation) {
      resumeArgs = ["--continue"]
    }

    // claude-p accepts the same flags as claude -p
    const coreArgs = [
      "--output-format", "stream-json",
      "--verbose",
      ...(opts.planMode ? ["--permission-mode", "plan"] : ["--dangerously-skip-permissions"]),
      "--model", model,
      ...(opts.effort ? ["--effort", opts.effort] : []),
      "--append-system-prompt", opts.systemPrompt,
      ...(opts.allowedTools ? ["--allowedTools", opts.allowedTools.join(",")] : []),
      ...resumeArgs,
      opts.prompt,
    ]

    // If using npx, prepend claude-p
    const args = bin === "npx" ? ["claude-p", ...coreArgs] : coreArgs

    return { bin, args }
  },

  // Output format is identical to claude -p stream-json, so reuse Claude's parser
  parseStreamLine(line: string): NormalizedStreamEvent | null {
    let event: ClaudeRawEvent
    try {
      event = JSON.parse(line) as ClaudeRawEvent
    } catch {
      return null
    }

    // Sub-agent events
    if (event.parent_tool_use_id) {
      return { type: "subagent", toolUseId: event.parent_tool_use_id, event: event as unknown as Record<string, unknown> }
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text") return { type: "text", text: block.text ?? "" }
        if (block.type === "thinking") return { type: "thinking", text: block.thinking ?? "" }
        if (block.type === "tool_use") return { type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: block.input }
      }
    }

    if (event.type === "tool_result") {
      return { type: "tool_result", toolUseId: event.tool_use_id ?? "", content: typeof event.content === "string" ? event.content : "" }
    }

    if (event.type === "result") {
      return {
        type: "usage",
        inputTokens: event.usage?.input_tokens,
        outputTokens: event.usage?.output_tokens,
        cacheReadTokens: event.usage?.cache_read_input_tokens,
        cacheWriteTokens: event.usage?.cache_creation_input_tokens,
      }
    }

    if (event.type === "system" && event.subtype === "init" && event.session_id) {
      return { type: "session_init", sessionId: event.session_id }
    }

    if (event.tool_use_id || event.parent_tool_use_id) {
      const toolUseId = event.parent_tool_use_id ?? event.tool_use_id ?? ""
      return { type: "subagent", toolUseId, event: event as unknown as Record<string, unknown> }
    }

    return null
  },

  resolveModel(model: string): string {
    if (!model) return "claude-sonnet-4-6"
    if (model.startsWith("claude-")) return model
    return MODEL_ALIASES[model] ?? "claude-sonnet-4-6"
  },

  getModels() {
    return MODELS
  },
}
