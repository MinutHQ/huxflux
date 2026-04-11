import { execFileSync } from "node:child_process"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "./types.js"

// Cached models fetched from `opencode models`
let _models: Array<{ id: string; label: string; api: string }> | null = null
let _modelsLastFetch = 0

function fetchModels(bin: string): Array<{ id: string; label: string; api: string }> {
  // Cache for 5 minutes
  if (_models && Date.now() - _modelsLastFetch < 300_000) return _models
  try {
    const output = execFileSync(bin, ["models"], { encoding: "utf8", timeout: 10_000 })
    _models = output.trim().split("\n").filter(Boolean).map((line) => {
      const id = line.trim()
      // Label: strip provider prefix for display
      const label = id.includes("/") ? id.split("/").slice(1).join("/") : id
      return { id, label, api: id }
    })
    _modelsLastFetch = Date.now()
    return _models
  } catch {
    return [
      { id: "opencode/minimax-m2.5-free", label: "minimax-m2.5-free", api: "opencode/minimax-m2.5-free" },
      { id: "opencode/nemotron-3-super-free", label: "nemotron-3-super-free", api: "opencode/nemotron-3-super-free" },
    ]
  }
}

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
    // Check common install locations
    const home = process.env.HOME ?? ""
    const candidates = [
      `${home}/.opencode/bin/opencode`,
      `${home}/.local/bin/opencode`,
      `${home}/go/bin/opencode`,
    ]
    for (const c of candidates) {
      try { execFileSync("test", ["-x", c]); _bin = c; return _bin } catch { /* next */ }
    }
    try { _bin = execFileSync("which", ["opencode"], { encoding: "utf8" }).trim() }
    catch { _bin = "opencode" }
    return _bin
  },

  isAvailable(): boolean {
    const bin = this.resolveBinary()
    try {
      execFileSync("test", ["-x", bin])
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
      "run",
      "--format", "json",
      ...(model ? ["-m", model] : []),
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

    // OpenCode JSON event types:
    // step_start, text, tool_call, tool_result, step_finish, error

    if (event.type === "text" && event.part?.text) {
      return { type: "text", text: event.part.text }
    }

    if (event.type === "tool_call" && event.part) {
      return {
        type: "tool_use",
        id: event.part.id ?? `oc-${Date.now()}`,
        name: event.part.name ?? event.part.tool ?? "unknown",
        input: event.part.input ?? event.part.arguments ?? {},
      }
    }

    if (event.type === "tool_result" && event.part) {
      return { type: "tool_result", toolUseId: event.part.toolCallID ?? event.part.id ?? "", content: event.part.text ?? event.part.output ?? "" }
    }

    if (event.type === "step_start" && event.sessionID) {
      return { type: "session_init", sessionId: event.sessionID }
    }

    if (event.type === "step_finish" && event.part?.tokens) {
      return {
        type: "usage",
        inputTokens: event.part.tokens.input,
        outputTokens: event.part.tokens.output,
      }
    }

    if (event.type === "error") {
      return { type: "error", message: event.error?.data?.message ?? event.error?.message ?? "Unknown error" }
    }

    return null
  },

  resolveModel(model: string): string {
    if (!model) return ""  // use opencode default
    return model  // OpenCode models are already in provider/model format
  },

  getModels() {
    return fetchModels(this.resolveBinary())
  },
}
