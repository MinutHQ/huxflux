import { execFileSync } from "node:child_process"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "./types.js"

const MODELS = [
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", api: "anthropic/claude-sonnet-4-6" },
  { id: "openai/gpt-4.1", label: "GPT-4.1", api: "openai/gpt-4.1" },
  { id: "openai/o3", label: "o3", api: "openai/o3" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", api: "google/gemini-2.5-pro" },
]

let _bin: string | null = null

export const opencodeProvider: ProviderAdapter = {
  id: "opencode",
  name: "OpenCode",

  capabilities: {
    sessionResume: true,
    sessionContinue: true,
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

  resolveBinary(): string {
    if (_bin) return _bin
    if (process.env.OPENCODE_BIN) { _bin = process.env.OPENCODE_BIN; return _bin }
    try { _bin = execFileSync("which", ["opencode"], { encoding: "utf8" }).trim() }
    catch { _bin = "opencode" }
    return _bin
  },

  isAvailable(): boolean {
    try {
      execFileSync("which", ["opencode"], { encoding: "utf8" })
      return true
    } catch {
      return false
    }
  },

  buildSpawnArgs(opts: SpawnOptions): SpawnResult {
    const bin = this.resolveBinary()
    const model = this.resolveModel(opts.model)

    const prompt = opts.conversationContext
      ? `${opts.conversationContext}\n\n${opts.systemPrompt}\n\nUser: ${opts.prompt}`
      : `${opts.systemPrompt}\n\nUser: ${opts.prompt}`

    const args = [
      "-m", model,
      "--format", "json",
      ...(opts.sessionId ? ["-s", opts.sessionId] : opts.isContinuation ? ["-c"] : []),
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

    // OpenCode JSON output format — adapt to normalized events
    if (event.type === "text" || event.type === "content" || event.type === "message") {
      return { type: "text", text: event.text ?? event.content ?? event.message ?? "" }
    }
    if (event.type === "tool_use" || event.type === "tool_call") {
      return {
        type: "tool_use",
        id: event.id ?? `oc-${Date.now()}`,
        name: event.name ?? event.tool ?? "unknown",
        input: event.input ?? event.arguments ?? {},
      }
    }
    if (event.type === "tool_result") {
      return { type: "tool_result", toolUseId: event.tool_use_id ?? event.id ?? "", content: event.content ?? event.output ?? "" }
    }
    if (event.type === "session" && event.id) {
      return { type: "session_init", sessionId: event.id }
    }
    if (event.type === "usage") {
      return {
        type: "usage",
        inputTokens: event.input_tokens,
        outputTokens: event.output_tokens,
      }
    }
    if (event.type === "error") {
      return { type: "error", message: event.message ?? "Unknown error" }
    }
    if (event.type === "done" || event.type === "result") {
      return { type: "done", result: event.message ?? event.result }
    }

    // Fallback
    if (typeof event.text === "string") return { type: "text", text: event.text }
    if (typeof event.content === "string") return { type: "text", text: event.content }

    return null
  },

  resolveModel(model: string): string {
    if (!model) return "anthropic/claude-sonnet-4-6"
    const found = MODELS.find((m) => m.id === model || m.label === model || m.api === model)
    return found?.api ?? model
  },

  getModels() {
    return MODELS
  },
}
