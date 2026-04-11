import { execFileSync } from "node:child_process"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "./types.js"

const MODELS = [
  { id: "codex-default", label: "Default", api: "" },
  { id: "o3", label: "o3", api: "o3" },
  { id: "o4-mini", label: "o4-mini", api: "o4-mini" },
]

let _bin: string | null = null

export const codexProvider: ProviderAdapter = {
  id: "codex",
  name: "Codex CLI",

  capabilities: {
    sessionResume: false,
    sessionContinue: false,
    planMode: false,
    streamingJson: true,
    toolUseEvents: false,
    thinkingBlocks: false,
    askUserQuestion: false,
    systemPromptFlag: false,
    allowedToolsRestriction: false,
    subAgentSupport: false,
  } satisfies ProviderCapabilities,

  resolveBinary(): string {
    if (_bin) return _bin
    if (process.env.CODEX_BIN) { _bin = process.env.CODEX_BIN; return _bin }
    try { _bin = execFileSync("which", ["codex"], { encoding: "utf8" }).trim() }
    catch { _bin = "codex" }
    return _bin
  },

  isAvailable(): boolean {
    try {
      execFileSync("which", ["codex"], { encoding: "utf8" })
      return true
    } catch {
      return false
    }
  },

  buildSpawnArgs(opts: SpawnOptions): SpawnResult {
    const bin = this.resolveBinary()
    const model = this.resolveModel(opts.model)

    // Codex uses "exec" subcommand for non-interactive mode
    // --json outputs JSONL events
    const prompt = opts.conversationContext
      ? `${opts.conversationContext}\n\n${opts.systemPrompt}\n\nUser: ${opts.prompt}`
      : `${opts.systemPrompt}\n\nUser: ${opts.prompt}`

    const args = [
      "exec",
      "--json",
      ...(model ? ["--model", model] : []),
      "--dangerously-bypass-approvals-and-sandbox",
      prompt,
    ]

    return { bin, args }
  },

  parseStreamLine(line: string): NormalizedStreamEvent | null {
    let event: Record<string, any>
    try {
      event = JSON.parse(line)
    } catch {
      return null
    }

    // Codex JSONL event types:
    // thread.started, turn.started, item.started, item.completed, turn.completed, turn.failed, error

    if (event.type === "item.completed" && event.item) {
      const item = event.item
      if (item.type === "agent_message" && item.text) {
        return { type: "text", text: item.text }
      }
      if (item.type === "command_execution") {
        return {
          type: "tool_use",
          id: item.id ?? `codex-${Date.now()}`,
          name: "Bash",
          input: { command: item.command, output: item.aggregated_output, exit_code: item.exit_code },
        }
      }
      if (item.type === "file_edit") {
        return {
          type: "tool_use",
          id: item.id ?? `codex-${Date.now()}`,
          name: "Edit",
          input: { file: item.file_path, description: item.description },
        }
      }
    }

    if (event.type === "turn.completed" && event.usage) {
      return {
        type: "usage",
        inputTokens: event.usage.input_tokens,
        outputTokens: event.usage.output_tokens,
        cacheReadTokens: event.usage.cached_input_tokens,
      }
    }

    if (event.type === "error") {
      return { type: "error", message: event.message ?? "Unknown error" }
    }

    if (event.type === "turn.failed") {
      return { type: "error", message: event.error?.message ?? "Turn failed" }
    }

    return null
  },

  resolveModel(model: string): string {
    if (!model || model === "codex-default") return ""  // empty = use codex default model
    const found = MODELS.find((m) => m.id === model || m.label === model || m.api === model)
    return found?.api ?? model
  },

  getModels() {
    return MODELS
  },
}
