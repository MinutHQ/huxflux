import { execFileSync } from "node:child_process"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "./types.js"

const MODEL_ALIASES: Record<string, string> = {
  "Gemini 2.5 Flash": "gemini-2.5-flash",
  "Gemini 2.5 Pro": "gemini-2.5-pro",
  "Gemini 2.5 Flash Lite": "gemini-2.5-flash-lite",
}

const MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", api: "gemini-2.5-flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", api: "gemini-2.5-pro" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", api: "gemini-2.5-flash-lite" },
]

let _bin: string | null = null

export const geminiProvider: ProviderAdapter = {
  id: "gemini" as any,
  name: "Gemini CLI",

  capabilities: {
    sessionResume: true,
    sessionContinue: false,
    planMode: true,
    streamingJson: true,
    toolUseEvents: true,
    thinkingBlocks: true,
    askUserQuestion: false,
    systemPromptFlag: false,
    allowedToolsRestriction: false,
    subAgentSupport: true,
    effortLevels: [],
  } satisfies ProviderCapabilities,

  resolveBinary(): string {
    if (_bin) return _bin
    if (process.env.GEMINI_BIN) { _bin = process.env.GEMINI_BIN; return _bin }
    try { _bin = execFileSync("which", ["gemini"], { encoding: "utf8" }).trim() }
    catch { _bin = "gemini" }
    return _bin
  },

  isAvailable(): boolean {
    try {
      execFileSync("which", [this.resolveBinary()], { encoding: "utf8" })
      return true
    } catch {
      return false
    }
  },

  buildSpawnArgs(opts: SpawnOptions): SpawnResult {
    const bin = this.resolveBinary()
    const model = this.resolveModel(opts.model)

    let resumeArgs: string[] = []
    if (opts.sessionId) {
      resumeArgs = ["--resume", opts.sessionId]
    }

    // Gemini uses --yolo for auto-approve (like Claude's --dangerously-skip-permissions)
    // and --approval-mode plan for plan mode
    const approvalArgs = opts.planMode ? ["--approval-mode", "plan"] : ["--yolo"]

    // Gemini doesn't have --append-system-prompt. Inject a trimmed system context
    // clearly separated from the user prompt so the model doesn't confuse them.
    const fullPrompt = opts.systemPrompt
      ? `<system_instructions>\n${opts.systemPrompt}\n</system_instructions>\n\n<user_message>\n${opts.prompt}\n</user_message>`
      : opts.prompt

    const args = [
      "-p", fullPrompt,
      "--output-format", "stream-json",
      "--skip-trust",
      "--model", model,
      ...approvalArgs,
      ...resumeArgs,
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

    // Session init
    if (event.type === "init" && event.session_id) {
      return { type: "session_init", sessionId: event.session_id }
    }

    // Assistant text message
    if (event.type === "message" && event.role === "assistant" && event.content) {
      return { type: "text", text: event.content }
    }

    // Thinking
    if (event.type === "thinking" && event.content) {
      return { type: "thinking", text: event.content }
    }

    // Tool use
    if (event.type === "tool_use") {
      return { type: "tool_use", id: event.tool_id ?? `tool-${Date.now()}`, name: event.tool_name ?? event.name, input: event.parameters ?? event.input }
    }

    // Tool result
    if (event.type === "tool_result") {
      return { type: "tool_result", toolUseId: event.tool_id ?? "", content: event.output ?? event.content ?? "" }
    }

    // Result/usage
    if (event.type === "result") {
      if (event.status === "error" && event.error) {
        return { type: "error", message: event.error.message ?? "Gemini API error" }
      }
      return {
        type: "usage",
        inputTokens: event.stats?.input_tokens ?? event.stats?.input,
        outputTokens: event.stats?.output_tokens ?? event.stats?.output,
      }
    }

    // Error
    if (event.type === "error") {
      return { type: "error", message: event.message ?? event.error ?? "Unknown error" }
    }

    return null
  },

  resolveModel(model: string): string {
    if (!model) return "gemini-2.5-flash"
    if (model.startsWith("gemini-")) return model
    return MODEL_ALIASES[model] ?? "gemini-2.5-flash"
  },

  getModels() {
    return MODELS
  },
}
