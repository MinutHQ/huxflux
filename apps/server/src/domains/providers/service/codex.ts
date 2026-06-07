import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"
import { createBinaryResolver } from "./binary.js"

interface CodexRawItem {
  type?: string
  id?: string
  text?: string
  command?: string
  aggregated_output?: string
  exit_code?: number
  file_path?: string
  description?: string
}

interface CodexRawEvent {
  type?: string
  item?: CodexRawItem
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cached_input_tokens?: number
  }
  message?: string
  error?: { message?: string }
}

const MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4", api: "gpt-5.4" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", api: "gpt-5.4-mini" },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", api: "gpt-5.3-codex" },
  { id: "gpt-5.2", label: "GPT-5.2", api: "gpt-5.2" },
]

const binary = createBinaryResolver({ defaultBin: "codex", envVar: "CODEX_BIN" })

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
    effortLevels: [],
  } satisfies ProviderCapabilities,

  resolveBinary: binary.resolve,
  isAvailable: binary.isAvailable,
  warmAvailability: binary.warmAvailability,

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
    let event: CodexRawEvent
    try {
      event = JSON.parse(line) as CodexRawEvent
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
    if (!model) return "gpt-5.4"
    const found = MODELS.find((m) => m.id === model || m.label === model || m.api === model)
    return found?.api ?? model
  },

  getModels() {
    return MODELS
  },
}
