import * as fs from "node:fs/promises"
import type { ProviderAdapter, ProviderCapabilities, ProviderModel, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"
import { createBinaryResolver } from "./binary.js"
import { claudeContinueProbePath, claudeSessionFilePath } from "./claudeSessionPaths.js"
import { getModelsForHarness } from "./modelsCatalog.js"
import { logger } from "../../../logger.js"

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

const MODEL_ALIASES: Record<string, string> = {
  "Opus 5":     "claude-opus-5",
  "Opus 4.8":   "claude-opus-4-8",
  "Opus 4.7":   "claude-opus-4-7",
  "Opus 4.6":   "claude-opus-4-6",
  "Fable 5":    "claude-fable-5",
  "Sonnet 5":   "claude-sonnet-5",
  "Sonnet 4.6": "claude-sonnet-4-6",
  "Haiku 4.5":  "claude-haiku-4-5",
}

const CLAUDE_EFFORT_LEVELS = ["low", "medium", "high", "max"]

const FALLBACK_MODELS: ProviderModel[] = [
  { id: "claude-opus-5",             label: "Opus 5",     api: "claude-opus-5",             effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
  { id: "claude-opus-4-8",           label: "Opus 4.8",   api: "claude-opus-4-8",           effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
  { id: "claude-opus-4-7",           label: "Opus 4.7",   api: "claude-opus-4-7",           effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
  { id: "claude-opus-4-6",           label: "Opus 4.6",   api: "claude-opus-4-6",           effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
  { id: "claude-fable-5",            label: "Fable 5",    api: "claude-fable-5",            effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
  { id: "claude-sonnet-5",           label: "Sonnet 5",   api: "claude-sonnet-5",           effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6", api: "claude-sonnet-4-6",         effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",  api: "claude-haiku-4-5-20251001", effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" },
]

const binary = createBinaryResolver({ defaultBin: "claude", envVar: "CLAUDE_BIN" })

export const claudeProvider: ProviderAdapter = {
  id: "claude",
  name: "Claude Code",

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

  resolveBinary: binary.resolve,
  isAvailable: binary.isAvailable,
  warmAvailability: binary.warmAvailability,

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

    // The prompt goes over stdin (stream-json input mode) instead of argv.
    // `--permission-prompt-tool stdio` makes the CLI expose AskUserQuestion in
    // print mode and route it as a `can_use_tool` control_request on stdout,
    // which the runner answers on stdin. The open stdin pipe also lets the
    // server inject user messages mid-run.
    const args = [
      "--print",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      ...(opts.planMode ? ["--permission-mode", "plan"] : ["--dangerously-skip-permissions"]),
      "--permission-prompt-tool", "stdio",
      "--model", model,
      ...(opts.effort ? ["--effort", opts.effort] : []),
      "--append-system-prompt", opts.systemPrompt,
      "--allowedTools", [...(opts.allowedTools ?? []), "AskUserQuestion"].join(","),
      ...resumeArgs,
    ]

    const stdinInit = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: opts.prompt }] },
    })

    return { bin, args, stdinInit }
  },

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
      // Claude sends multiple blocks in one event — return them as separate events
      // The runner will call parseStreamLine for each line, so we return the first block
      // and the runner handles iteration over blocks
      for (const block of event.message.content) {
        if (block.type === "text") {
          return { type: "text", text: block.text ?? "" }
        }
        if (block.type === "thinking") {
          return { type: "thinking", text: block.thinking ?? "" }
        }
        if (block.type === "tool_use") {
          return { type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: block.input }
        }
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

    // Unknown events — forward as subagent if they have a tool_use_id
    if (event.tool_use_id || event.parent_tool_use_id) {
      const toolUseId = event.parent_tool_use_id ?? event.tool_use_id ?? ""
      return { type: "subagent", toolUseId, event: event as unknown as Record<string, unknown> }
    }

    return null
  },

  resolveModel(model: string): string {
    if (!model) return "claude-sonnet-4-6"
    if (model.startsWith("claude-")) return model
    if (MODEL_ALIASES[model]) return MODEL_ALIASES[model]
    const models = this.getModels()
    const match = models.find((m) => m.id === model || m.label === model)
    return match?.api ?? "claude-sonnet-4-6"
  },

  getModels() {
    const catalog = getModelsForHarness("claude")
    if (!catalog) return FALLBACK_MODELS
    return catalog.map((m) => ({ ...m, effortLevels: CLAUDE_EFFORT_LEVELS, defaultEffort: "high" }))
  },

  sessionFilePath(cwd: string, sessionId: string): string {
    return claudeSessionFilePath(cwd, sessionId)
  },

  continueProbePath(cwd: string): string {
    return claudeContinueProbePath(cwd)
  },

  async installHooks(_agentId: string, _cwd: string, _apiBase: string, _authToken: string): Promise<void> {
    // AskUserQuestion is now answered over the CLI's stdin control protocol
    // (`--permission-prompt-tool stdio`). Older Huxflux versions installed a
    // PreToolUse hook in ~/.claude/settings.json that blocks the tool call
    // waiting for an answer file — with the control protocol active that hook
    // would deadlock the tool before the can_use_tool request is ever sent,
    // so remove the legacy entry if present.
    try {
      const homeClaudeDir = `${process.env.HOME}/.claude`
      const settingsPath = `${homeClaudeDir}/settings.json`
      let settings: Record<string, unknown> = {}
      try { settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) } catch { return }
      const hooks = settings.hooks as Record<string, unknown[]> | undefined
      const preToolUse = hooks?.PreToolUse as Array<{ matcher?: string; hooks?: unknown[] }> | undefined
      if (!preToolUse) return

      const isLegacyAskHook = (h: { matcher?: string; hooks?: unknown[] }): boolean =>
        h.matcher === "AskUserQuestion" && Array.isArray(h.hooks) && h.hooks.some((hk) => {
          const cmd = (hk as { command?: unknown }).command
          return typeof cmd === "string" && cmd.includes("huxflux-ask-user")
        })

      const filtered = preToolUse.filter((h) => !isLegacyAskHook(h))
      if (filtered.length === preToolUse.length) return

      if (filtered.length > 0) hooks!.PreToolUse = filtered
      else delete hooks!.PreToolUse
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
      await fs.rm(`${homeClaudeDir}/hooks/huxflux-ask-user.sh`, { force: true })
      logger.info(`[claude] Removed legacy AskUserQuestion hook from ~/.claude/settings.json`)
    } catch (hookErr) {
      logger.warn({ err: (hookErr as Error).message }, `[claude] Failed to clean up legacy AskUserQuestion hook`)
    }
  },
}
