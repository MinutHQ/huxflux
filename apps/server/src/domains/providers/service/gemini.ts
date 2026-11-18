import type { ProviderAdapter, ProviderCapabilities, ProviderModel, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"
import { createBinaryResolver } from "./binary.js"
import { getModelsForHarness } from "./modelsCatalog.js"

interface GeminiRawEvent {
  type?: string
  role?: string
  content?: string
  session_id?: string
  tool_id?: string
  tool_name?: string
  name?: string
  parameters?: unknown
  input?: unknown
  output?: string
  status?: string
  error?: { message?: string } | string
  message?: string
  stats?: {
    input_tokens?: number
    output_tokens?: number
    input?: number
    output?: number
  }
}

// Label-to-id map. The 2.5 entries are kept because agents created before the
// 3.x models existed still have those labels stored on their row; dropping
// them would leave those agents unable to resolve a model at all.
const MODEL_ALIASES: Record<string, string> = {
  "Gemini 4 Argon": "gemini-4-argon",
  "Gemini 3.8 Flash": "gemini-3.8-flash",
  "Gemini 3.7 Flash": "gemini-3.7-flash",
  "Gemini 3.6 Flash": "gemini-3.6-flash",
  "Gemini 3.5 Flash": "gemini-3.5-flash",
  "Gemini 3.5 Flash Lite": "gemini-3.5-flash-lite",
  "Gemini Pro (latest)": "gemini-pro-latest",
  "Gemini Flash (latest)": "gemini-flash-latest",
  "Gemini 2.5 Flash": "gemini-2.5-flash",
  "Gemini 2.5 Pro": "gemini-2.5-pro",
  "Gemini 2.5 Flash Lite": "gemini-2.5-flash-lite",
}

// Used only when the live catalog at models.dev is unreachable. The two
// `-latest` aliases track whatever Google currently points them at, so they
// stay usable even when this list ages. Verified against it 2026-11-05.
const FALLBACK_MODELS: ProviderModel[] = [
  { id: "gemini-4-argon",         label: "Gemini 4 Argon",         api: "gemini-4-argon" },
  { id: "gemini-3.8-flash",       label: "Gemini 3.8 Flash",       api: "gemini-3.8-flash" },
  { id: "gemini-3.7-flash",       label: "Gemini 3.7 Flash",       api: "gemini-3.7-flash" },
  { id: "gemini-3.6-flash",       label: "Gemini 3.6 Flash",       api: "gemini-3.6-flash" },
  { id: "gemini-3.5-flash",       label: "Gemini 3.5 Flash",       api: "gemini-3.5-flash" },
  { id: "gemini-3.5-flash-lite",  label: "Gemini 3.5 Flash Lite",  api: "gemini-3.5-flash-lite" },
  { id: "gemini-pro-latest",      label: "Gemini Pro (latest)",    api: "gemini-pro-latest" },
  { id: "gemini-flash-latest",    label: "Gemini Flash (latest)",  api: "gemini-flash-latest" },
]

const binary = createBinaryResolver({ defaultBin: "gemini", envVar: "GEMINI_BIN" })

export const geminiProvider: ProviderAdapter = {
  id: "gemini",
  name: "Gemini CLI",

  capabilities: {
    permissionModes: ["plan", "bypassPermissions"],
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

  resolveBinary: binary.resolve,
  isAvailable: binary.isAvailable,
  warmAvailability: binary.warmAvailability,

  buildSpawnArgs(opts: SpawnOptions): SpawnResult {
    const bin = this.resolveBinary()
    const model = this.resolveModel(opts.model)

    let resumeArgs: string[] = []
    if (opts.sessionId) {
      resumeArgs = ["--resume", opts.sessionId]
    }

    // Gemini uses --yolo for auto-approve (like Claude's --dangerously-skip-permissions)
    // and --approval-mode plan for plan mode
    // Gemini has no middle ground: --yolo auto-approves everything and
    // --approval-mode plan is read-only. `capabilities.permissionModes` only
    // advertises those two, so anything else has already been narrowed away.
    const approvalArgs = opts.planMode || opts.permissionMode === "plan"
      ? ["--approval-mode", "plan"]
      : ["--yolo"]

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
    let event: GeminiRawEvent
    try {
      event = JSON.parse(line) as GeminiRawEvent
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
      return { type: "tool_use", id: event.tool_id ?? `tool-${Date.now()}`, name: event.tool_name ?? event.name ?? "", input: event.parameters ?? event.input }
    }

    // Tool result
    if (event.type === "tool_result") {
      return { type: "tool_result", toolUseId: event.tool_id ?? "", content: event.output ?? event.content ?? "" }
    }

    // Result/usage
    if (event.type === "result") {
      if (event.status === "error" && event.error) {
        const errMsg = typeof event.error === "string" ? event.error : event.error.message
        return { type: "error", message: errMsg ?? "Gemini API error" }
      }
      return {
        type: "usage",
        inputTokens: event.stats?.input_tokens ?? event.stats?.input,
        outputTokens: event.stats?.output_tokens ?? event.stats?.output,
      }
    }

    // Error
    if (event.type === "error") {
      const errStr = typeof event.error === "string" ? event.error : event.error?.message
      return { type: "error", message: event.message ?? errStr ?? "Unknown error" }
    }

    return null
  },

  resolveModel(model: string): string {
    // `-latest` rather than a pinned version: this is the no-model-chosen
    // fallback, so it should follow Google's current pick instead of ageing.
    if (!model) return "gemini-flash-latest"
    if (model.startsWith("gemini-")) return model
    if (MODEL_ALIASES[model]) return MODEL_ALIASES[model]
    const models = this.getModels()
    const match = models.find((m) => m.id === model || m.label === model)
    return match?.api ?? "gemini-flash-latest"
  },

  getModels() {
    return getModelsForHarness("gemini") ?? FALLBACK_MODELS
  },
}
