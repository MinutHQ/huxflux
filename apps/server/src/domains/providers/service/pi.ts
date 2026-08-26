import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"
import { createBinaryResolver } from "./binary.js"

const execFileAsync = promisify(execFile)

/** pi is provider-agnostic; default to Anthropic when the caller passes no model. */
const DEFAULT_PROVIDER = "anthropic"
const DEFAULT_MODEL = `${DEFAULT_PROVIDER}/claude-sonnet-4-6`

/**
 * Static catalog used until (or if) `pi --list-models` discovery has not yet
 * produced a real list. pi validates `--model` at spawn time, so a wrong id
 * surfaces as a clear spawn error rather than a silent fallback.
 */
const FALLBACK_MODELS: Array<{ id: string; label: string; api: string }> = [
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", api: "anthropic/claude-sonnet-4-6" },
  { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", api: "anthropic/claude-opus-4-8" },
  { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", api: "anthropic/claude-haiku-4-5-20251001" },
]

/** pi `--thinking` levels (subset we expose as Huxflux "effort"). */
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

const binary = createBinaryResolver({ defaultBin: "pi", envVar: "PI_BIN" })

// Populated by `warmAvailability()` from `pi --list-models`; falls back to the
// static list above when discovery has not run or failed.
let models: Array<{ id: string; label: string; api: string }> = [...FALLBACK_MODELS]
let discoveryPromise: Promise<void> | null = null

interface PiToolCall {
  id?: string
  name?: string
  arguments?: unknown
}

interface PiAssistantMessageEvent {
  type?: string
  delta?: string
  toolCall?: PiToolCall
}

interface PiUsage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

interface PiAssistantMessage {
  role?: string
  usage?: PiUsage
  stopReason?: string
  errorMessage?: string
}

interface PiToolResultBlock {
  type?: string
  text?: string
}

interface PiRawEvent {
  type?: string
  id?: string
  assistantMessageEvent?: PiAssistantMessageEvent
  message?: PiAssistantMessage
  toolCallId?: string
  result?: { content?: PiToolResultBlock[] }
  error?: string
}

/**
 * Pi provider — drives the `pi` CLI in one-shot JSON mode
 * (`pi --mode json --print "<prompt>"`). pi streams JSONL events to stdout and
 * exits when the turn settles, which fits the runner's spawn-per-turn model.
 *
 * Install: npm install -g @earendil-works/pi-coding-agent
 */
export const piProvider: ProviderAdapter = {
  id: "pi",
  name: "Pi",

  capabilities: {
    sessionResume: true,
    sessionContinue: true,
    planMode: false,
    streamingJson: true,
    toolUseEvents: true,
    thinkingBlocks: true,
    askUserQuestion: false,
    systemPromptFlag: true,
    allowedToolsRestriction: true,
    subAgentSupport: false,
    effortLevels: ["low", "medium", "high", "max"],
  } satisfies ProviderCapabilities,

  resolveBinary: binary.resolve,
  isAvailable: binary.isAvailable,

  // Warm the binary resolver, then (if pi is installed) refresh the model
  // catalog from `pi --list-models`. Both are async so nothing blocks the
  // event loop; failures are swallowed and the static fallback is kept.
  warmAvailability: async () => {
    await binary.warmAvailability()
    if (!binary.isAvailable()) return
    await discoverModels()
  },

  buildSpawnArgs(opts: SpawnOptions): SpawnResult {
    const bin = this.resolveBinary()
    const model = this.resolveModel(opts.model)

    const args = ["--mode", "json", "--print"]
    if (model) args.push("--model", model)

    // pi has `--append-system-prompt`, so we keep its built-in coding prompt
    // and append our huxflux context — no XML wrapping needed (unlike Gemini).
    if (opts.systemPrompt) args.push("--append-system-prompt", opts.systemPrompt)

    // Session management. pi's `--session-id` creates the session if missing;
    // `--continue` resumes the most recent one for the cwd.
    if (opts.sessionId) {
      args.push("--session-id", opts.sessionId)
    } else if (opts.isContinuation) {
      args.push("--continue")
    }

    if (opts.effort && THINKING_LEVELS.includes(opts.effort)) {
      args.push("--thinking", opts.effort)
    }
    if (opts.allowedTools?.length) {
      args.push("--tools", opts.allowedTools.join(","))
    }

    // Providers without session resume get the full conversation prepended.
    const prompt = opts.conversationContext
      ? `${opts.conversationContext}\n\n<user_message>\n${opts.prompt}\n</user_message>`
      : opts.prompt

    // `--` ends option parsing so a prompt that starts with `-` is safe.
    args.push("--", prompt)
    return { bin, args }
  },

  parseStreamLine(line: string): NormalizedStreamEvent | null {
    let event: PiRawEvent
    try {
      event = JSON.parse(line) as PiRawEvent
    } catch {
      return null
    }

    // First line is the session header — carries the session id for resume.
    if (event.type === "session" && event.id) {
      return { type: "session_init", sessionId: event.id }
    }

    // Streaming deltas and tool-call completion live under message_update.
    if (event.type === "message_update") {
      const delta = event.assistantMessageEvent
      if (!delta) return null
      if (delta.type === "text_delta" && typeof delta.delta === "string") {
        return { type: "text", text: delta.delta }
      }
      if (delta.type === "thinking_delta" && typeof delta.delta === "string") {
        return { type: "thinking", text: delta.delta }
      }
      // toolcall_end carries the full, authoritative call (id, name, args).
      if (delta.type === "toolcall_end" && delta.toolCall) {
        const tc = delta.toolCall
        return { type: "tool_use", id: tc.id ?? "", name: tc.name ?? "", input: tc.arguments }
      }
      return null
    }

    // Tool result — correlate via toolCallId (== toolCall.id from toolcall_end).
    if (event.type === "tool_execution_end") {
      return {
        type: "tool_result",
        toolUseId: event.toolCallId ?? "",
        content: extractToolResultText(event.result),
      }
    }

    // The authoritative assistant message end carries cumulative usage and, on
    // failure, the error message.
    if (event.type === "message_end" && event.message?.role === "assistant") {
      const msg = event.message
      if (msg.stopReason === "error" && msg.errorMessage) {
        return { type: "error", message: msg.errorMessage }
      }
      const usage = msg.usage
      if (usage) {
        return {
          type: "usage",
          inputTokens: usage.input,
          outputTokens: usage.output,
          cacheReadTokens: usage.cacheRead,
          cacheWriteTokens: usage.cacheWrite,
        }
      }
      return null
    }

    // Extension failures surface as first-class error events.
    if (event.type === "extension_error" && event.error) {
      return { type: "error", message: event.error }
    }

    return null
  },

  resolveModel(model: string): string {
    if (!model) {
      // Honor the Anthropic default when the catalog has one, else first entry.
      const preferred = models.find((m) => m.api.startsWith(`${DEFAULT_PROVIDER}/`))
      const pick = preferred ?? models[0]
      return pick ? pick.api : DEFAULT_MODEL
    }
    const match = models.find((m) => m.id === model || m.api === model || m.label === model)
    if (match) return match.api
    // Unknown ids pass through — pi accepts `provider/id` patterns directly and
    // validates them at spawn time.
    return model
  },

  getModels() {
    return models
  },
}

function extractToolResultText(result?: { content?: PiToolResultBlock[] }): string {
  if (!result?.content) return ""
  return result.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
}

/**
 * Parse `pi --list-models` output. The table is fixed-width: each column is
 * `padEnd`-padded to the max width across all rows and joined by two spaces,
 * and the header uses the same widths as the data rows. So the column start
 * offsets read from the header apply verbatim to every row. We only need the
 * `provider` and `model` columns (both space-free) and compose the pi model
 * pattern `provider/id`.
 */
export function parseListModelsTable(raw: string): Array<{ id: string; label: string; api: string }> {
  const lines = raw.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = lines[0]
  const modelStart = header.indexOf("model")
  const contextStart = header.indexOf("context")
  if (modelStart === -1 || contextStart === -1 || contextStart <= modelStart) return []

  const out: Array<{ id: string; label: string; api: string }> = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const provider = line.slice(0, modelStart).trim()
    const model = line.slice(modelStart, contextStart).trim()
    if (!provider || !model) continue
    const api = `${provider}/${model}`
    out.push({ id: api, label: model, api })
  }
  return out
}

function discoverModels(): Promise<void> {
  if (discoveryPromise) return discoveryPromise
  discoveryPromise = (async () => {
    try {
      const bin = binary.resolve()
      const { stdout } = await execFileAsync(bin, ["--list-models"], { encoding: "utf8", timeout: 20_000 })
      const parsed = parseListModelsTable(stdout)
      if (parsed.length > 0) models = parsed
    } catch {
      // Keep the fallback catalog; a bad --model still fails loudly at spawn.
    }
  })()
  return discoveryPromise
}
