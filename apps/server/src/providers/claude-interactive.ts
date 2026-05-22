import { execFileSync } from "node:child_process"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "./types.js"

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

let _bin: string | null = null

export const claudeInteractiveProvider: ProviderAdapter = {
  id: "claude-interactive" as any,
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

  resolveBinary(): string {
    if (_bin) return _bin
    if (process.env.CLAUDE_P_BIN) { _bin = process.env.CLAUDE_P_BIN; return _bin }
    // Try claude-p first, then npx claude-p
    try {
      _bin = execFileSync("which", ["claude-p"], { encoding: "utf8" }).trim()
      return _bin
    } catch {}
    // Fallback to npx
    _bin = "npx"
    return _bin
  },

  isAvailable(): boolean {
    try {
      execFileSync("which", ["claude-p"], { encoding: "utf8" })
      return true
    } catch {
      // Check if npx can find it
      try {
        execFileSync("npx", ["claude-p", "--help"], { encoding: "utf8", timeout: 10_000 })
        return true
      } catch {
        return false
      }
    }
  },

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
    let event: Record<string, any>
    try {
      event = JSON.parse(line)
    } catch {
      return null
    }

    // Sub-agent events
    if ("parent_tool_use_id" in event && event.parent_tool_use_id) {
      return { type: "subagent", toolUseId: event.parent_tool_use_id as string, event }
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text") return { type: "text", text: block.text }
        if (block.type === "thinking") return { type: "thinking", text: block.thinking }
        if (block.type === "tool_use") return { type: "tool_use", id: block.id, name: block.name, input: block.input }
      }
    }

    if (event.type === "tool_result") {
      return { type: "tool_result", toolUseId: event.tool_use_id, content: event.content ?? "" }
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
      return { type: "subagent", toolUseId, event }
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
