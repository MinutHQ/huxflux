import { execFileSync } from "node:child_process"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "./types.js"

const MODELS = [
  { id: "o3", label: "o3", api: "o3" },
  { id: "o4-mini", label: "o4-mini", api: "o4-mini" },
  { id: "gpt-4.1", label: "GPT-4.1", api: "gpt-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", api: "gpt-4.1-mini" },
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
    // --ask-for-approval never skips permission prompts
    const prompt = opts.conversationContext
      ? `${opts.conversationContext}\n\n${opts.systemPrompt}\n\nUser: ${opts.prompt}`
      : `${opts.systemPrompt}\n\nUser: ${opts.prompt}`

    const args = [
      "exec",
      "--json",
      "--model", model,
      "--ask-for-approval", "never",
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

    // Codex JSONL events — adapt to our normalized format
    // The exact event format depends on Codex CLI version
    if (event.type === "message" && event.content) {
      return { type: "text", text: event.content }
    }
    if (event.type === "text" || event.type === "content") {
      return { type: "text", text: event.text ?? event.content ?? "" }
    }
    if (event.type === "tool_call" || event.type === "function_call") {
      return {
        type: "tool_use",
        id: event.id ?? `codex-${Date.now()}`,
        name: event.name ?? event.function?.name ?? "unknown",
        input: event.arguments ?? event.function?.arguments ?? {},
      }
    }
    if (event.type === "tool_result" || event.type === "function_result") {
      return { type: "tool_result", toolUseId: event.tool_call_id ?? event.id ?? "", content: event.output ?? "" }
    }
    if (event.type === "usage") {
      return {
        type: "usage",
        inputTokens: event.input_tokens ?? event.prompt_tokens,
        outputTokens: event.output_tokens ?? event.completion_tokens,
      }
    }
    if (event.type === "error") {
      return { type: "error", message: event.message ?? event.error ?? "Unknown error" }
    }
    if (event.type === "done" || event.type === "result") {
      return { type: "done", result: event.message ?? event.result }
    }

    // Fallback: treat any event with a "text" or "content" field as text
    if (typeof event.text === "string") return { type: "text", text: event.text }
    if (typeof event.content === "string") return { type: "text", text: event.content }

    return null
  },

  resolveModel(model: string): string {
    if (!model) return "o4-mini"
    // If already an API id, pass through
    const found = MODELS.find((m) => m.id === model || m.label === model || m.api === model)
    return found?.api ?? model
  },

  getModels() {
    return MODELS
  },
}
