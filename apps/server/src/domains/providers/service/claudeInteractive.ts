// eslint-disable-next-line no-restricted-imports -- cached one-shot: which claude-p runs once then caches
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import * as path from "node:path"
import { existsSync } from "node:fs"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"

const requireFromHere = createRequire(import.meta.url)

/**
 * Resolve the `claude-p` binary in priority order:
 *   1. `CLAUDE_P_BIN` env override (absolute path or PATH name)
 *   2. The bundled dependency in node_modules — returned as the .js entry so
 *      we can spawn it with `process.execPath` and skip the .bin shell shim
 *   3. A globally-installed `claude-p` on PATH
 *   4. As an absolute last resort, the bare string `"npx"`; the spawn path
 *      below tags `--prefer-offline --yes` onto it so that doesn't repeatedly
 *      re-download. The previous design always reached here, and the per-turn
 *      `npx claude-p` was the load-bearing cause of the multi-second agent-
 *      start lag the user was seeing.
 */
function resolveClaudePBin(): string {
  const override = process.env.CLAUDE_P_BIN
  if (override) return override
  try {
    const pkgPath = requireFromHere.resolve("claude-p/package.json")
    const binJs = path.resolve(path.dirname(pkgPath), "bin", "claude-p.js")
    if (existsSync(binJs)) return binJs
  } catch { /* not bundled — fall through */ }
  try {
    return execFileSync("which", ["claude-p"], { encoding: "utf8" }).trim()
  } catch { /* not on PATH — fall through */ }
  return "npx"
}

let cachedBin: string | null = null
function getBin(): string {
  if (cachedBin) return cachedBin
  cachedBin = resolveClaudePBin()
  return cachedBin
}

interface ClaudeRawBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
}

interface ClaudeRawEvent {
  type?: string
  subtype?: string
  parent_tool_use_id?: string
  tool_use_id?: string
  session_id?: string
  content?: unknown
  message?: { content?: ClaudeRawBlock[] }
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

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

// Always-true availability check: `claude-p` is now a hard dependency of the
// server package, so the install will surface a problem long before runtime.
// If for some reason the bundled binary isn't present, we still fall back to
// `which` or `npx` at spawn time (see `resolveClaudePBin`).
const isAvailable = (): boolean => true

export const claudeInteractiveProvider: ProviderAdapter = {
  id: "claude-interactive",
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

  resolveBinary: getBin,
  isAvailable,

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

    // Three spawn shapes depending on how `claude-p` was found:
    //   - Bundled (absolute .js path): exec node directly, pass the script as
    //     argv[1]. Fastest path; no shell shim, no npx network round-trip.
    //   - Global on PATH (any non-.js absolute path or bare name): spawn it
    //     directly.
    //   - `npx` last-resort fallback: tag `--yes --prefer-offline` so npx
    //     uses the cache and never asks for confirmation. Still slower than
    //     the bundled path because npx has its own overhead.
    if (bin.endsWith(".js")) {
      return { bin: process.execPath, args: [bin, ...coreArgs] }
    }
    if (bin === "npx") {
      return { bin: "npx", args: ["--yes", "--prefer-offline", "claude-p", ...coreArgs] }
    }
    return { bin, args: coreArgs }
  },

  // Output format is identical to claude -p stream-json, so reuse Claude's parser
  parseStreamLine(line: string): NormalizedStreamEvent | null {
    let event: ClaudeRawEvent
    try {
      event = JSON.parse(line) as ClaudeRawEvent
    } catch {
      return null
    }

    // Sub-agent events
    if (event.parent_tool_use_id) {
      return { type: "subagent", toolUseId: event.parent_tool_use_id, event: event as unknown as Record<string, unknown> }
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text") return { type: "text", text: block.text ?? "" }
        if (block.type === "thinking") return { type: "thinking", text: block.thinking ?? "" }
        if (block.type === "tool_use") return { type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: block.input }
      }
    }

    if (event.type === "tool_result") {
      return { type: "tool_result", toolUseId: event.tool_use_id ?? "", content: typeof event.content === "string" ? event.content : "" }
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
      return { type: "subagent", toolUseId, event: event as unknown as Record<string, unknown> }
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
