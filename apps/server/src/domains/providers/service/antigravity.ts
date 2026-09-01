import type { ProviderAdapter, ProviderCapabilities, ProviderModel, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"
import { createBinaryResolver } from "./binary.js"

interface AgyToolInfo {
  name?: string
  parameters?: unknown
  output?: string
  error?: { type?: string; message?: string }
}

interface AgySubagentEntry {
  type_name?: string
  role?: string
  conversation_id?: string
  log_uri?: string
}

interface AgyUsage {
  input_tokens?: number
  output_tokens?: number
  thinking_tokens?: number
  cache_read_tokens?: number
}

interface AgyStepUpdate {
  conversation_id?: string
  step_index?: number
  state?: string
  step_type?: string
  text_delta?: string
  tool_name?: string
  tool_info?: AgyToolInfo
  subagent_info?: { subagents?: AgySubagentEntry[] }
  duration_seconds?: number
  usage?: AgyUsage
}

interface AgyResult {
  conversation_id?: string
  status?: string
  response?: string
  error?: string
  usage?: AgyUsage
}

interface AgyInit {
  cwd?: string
  model?: string
}

interface AgyRawEvent {
  event?: string
  conversation_id?: string
  init?: AgyInit
  step_update?: AgyStepUpdate
  result?: AgyResult
}

const MODEL_ALIASES: Record<string, string> = {
  "Gemini 3.7 Flash": "gemini-3.7-flash",
  "Gemini 3.6 Flash": "gemini-3.6-flash",
  "Gemini 3.1 Pro": "gemini-3.1-pro",
  "Claude Sonnet 4.6": "claude-sonnet-4-6",
  "Claude Opus 4.6": "claude-opus-4-6",
}

interface AgyModel extends ProviderModel {
  defaultEffort: string
  effortLevels: string[]
}

const MODELS: AgyModel[] = [
  { id: "gemini-3.7-flash",  label: "Gemini 3.7 Flash",  api: "gemini-3.7-flash",  defaultEffort: "medium", effortLevels: ["low", "medium", "high"] },
  { id: "gemini-3.6-flash",  label: "Gemini 3.6 Flash",  api: "gemini-3.6-flash",  defaultEffort: "medium", effortLevels: ["low", "medium", "high"] },
  { id: "gemini-3.1-pro",    label: "Gemini 3.1 Pro",    api: "gemini-3.1-pro",    defaultEffort: "high",   effortLevels: ["low", "high"] },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6",  api: "claude-sonnet-4-6", defaultEffort: "high",   effortLevels: ["high"] },
  { id: "claude-opus-4-6",   label: "Claude Opus 4.6",    api: "claude-opus-4-6",   defaultEffort: "high",   effortLevels: ["high"] },
  { id: "gpt-oss-120b",      label: "GPT-OSS 120B",       api: "gpt-oss-120b",      defaultEffort: "medium", effortLevels: ["medium"] },
]

function resolveEffort(modelApi: string, userEffort?: string): string {
  const entry = MODELS.find((m) => m.api === modelApi)
  if (!entry) return userEffort || "medium"
  if (userEffort && entry.effortLevels.includes(userEffort)) return userEffort
  return entry.defaultEffort
}

const binary = createBinaryResolver({ defaultBin: "agy", envVar: "AGY_BIN" })

export const antigravityProvider: ProviderAdapter = {
  id: "antigravity",
  name: "Antigravity",

  capabilities: {
    sessionResume: true,
    sessionContinue: true,
    planMode: true,
    streamingJson: true,
    toolUseEvents: true,
    thinkingBlocks: true,
    askUserQuestion: false,
    systemPromptFlag: false,
    allowedToolsRestriction: false,
    subAgentSupport: true,
    effortLevels: ["low", "medium", "high"],
  } satisfies ProviderCapabilities,

  resolveBinary: binary.resolve,
  isAvailable: binary.isAvailable,
  warmAvailability: binary.warmAvailability,

  buildSpawnArgs(opts: SpawnOptions): SpawnResult {
    const bin = this.resolveBinary()
    const model = this.resolveModel(opts.model)
    const effort = resolveEffort(model, opts.effort)

    let resumeArgs: string[] = []
    if (opts.sessionId) {
      resumeArgs = ["--conversation", opts.sessionId]
    } else if (opts.isContinuation) {
      resumeArgs = ["--continue"]
    }

    const modeArgs = opts.planMode ? ["--mode", "plan"] : ["--dangerously-skip-permissions"]

    const fullPrompt = opts.systemPrompt
      ? `<system_instructions>\n${opts.systemPrompt}\n</system_instructions>\n\n<user_message>\n${opts.prompt}\n</user_message>`
      : opts.prompt

    const args = [
      "-p", fullPrompt,
      "--output-format", "stream-json",
      "--model", model,
      "--effort", effort,
      ...modeArgs,
      ...resumeArgs,
    ]

    return { bin, args }
  },

  parseStreamLine(line: string): NormalizedStreamEvent | null {
    let event: AgyRawEvent
    try {
      event = JSON.parse(line) as AgyRawEvent
    } catch {
      return null
    }

    if (event.event === "init") {
      const convId = event.conversation_id ?? event.init?.cwd
      if (convId) return { type: "session_init", sessionId: convId }
      return null
    }

    if (event.event === "step_update" && event.step_update) {
      const step = event.step_update

      if (step.step_type === "agent_response" && typeof step.text_delta === "string") {
        return { type: "text", text: step.text_delta }
      }

      if (step.step_type === "thinking" && typeof step.text_delta === "string") {
        return { type: "thinking", text: step.text_delta }
      }

      if (step.step_type === "tool" && step.tool_info) {
        const ti = step.tool_info
        if (step.state === "DONE" && ti.output !== undefined) {
          return {
            type: "tool_result",
            toolUseId: `agy-${step.step_index ?? 0}`,
            content: ti.output ?? "",
          }
        }
        if (ti.name) {
          return {
            type: "tool_use",
            id: `agy-${step.step_index ?? 0}`,
            name: ti.name,
            input: ti.parameters,
          }
        }
      }

      if (step.step_type === "subagent" && step.subagent_info) {
        return {
          type: "subagent",
          toolUseId: `agy-sub-${step.step_index ?? 0}`,
          event: step as unknown as Record<string, unknown>,
        }
      }

      return null
    }

    if (event.event === "result" && event.result) {
      const r = event.result
      if (r.status === "ERROR" && r.error) {
        return { type: "error", message: r.error }
      }
      const usage = r.usage
      if (usage) {
        return {
          type: "usage",
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_tokens,
        }
      }
    }

    return null
  },

  resolveModel(model: string): string {
    if (!model) return "gemini-3.7-flash"
    if (MODEL_ALIASES[model]) return MODEL_ALIASES[model]
    const match = MODELS.find((m) => m.id === model || m.label === model || m.api === model)
    return match?.api ?? model
  },

  getModels() {
    return MODELS
  },
}
