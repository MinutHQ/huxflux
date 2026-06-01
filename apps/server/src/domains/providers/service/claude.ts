import * as fs from "node:fs/promises"
import type { ProviderAdapter, ProviderCapabilities, SpawnOptions, SpawnResult, NormalizedStreamEvent } from "../providers.types.js"
import { createBinaryResolver } from "./binary.js"

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

    const args = [
      "--print",
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

    return { bin, args }
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
    return MODEL_ALIASES[model] ?? "claude-sonnet-4-6"
  },

  getModels() {
    return MODELS
  },

  async installHooks(_agentId: string, _cwd: string, _apiBase: string, _authToken: string): Promise<void> {
    try {
      const homeClaudeDir = `${process.env.HOME}/.claude`
      const hooksDir = `${homeClaudeDir}/hooks`
      await fs.mkdir(hooksDir, { recursive: true })

      // The hook script waits for an answer file written by the server.
      // No curl, no network, no API calls. The server detects AskUserQuestion
      // from the streaming output and notifies the UI directly.
      const scriptPath = `${hooksDir}/huxflux-ask-user.sh`
      const scriptContent = [
        `#!/bin/bash`,
        `# Huxflux AskUserQuestion hook — waits for answer from the Hive UI`,
        `[ -z "$HUXFLUX_AGENT_ID" ] && exit 0`,
        `ANSWER_FILE="/tmp/huxflux-ask-$HUXFLUX_AGENT_ID"`,
        `for i in $(seq 1 1500); do`,
        `  [ -f "$ANSWER_FILE" ] && { cat "$ANSWER_FILE"; rm -f "$ANSWER_FILE"; exit 0; }`,
        `  sleep 0.2`,
        `done`,
        `exit 0`,
      ].join("\n")
      await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 })

      const settingsPath = `${homeClaudeDir}/settings.json`
      let settings: Record<string, unknown> = {}
      try { settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) } catch { /* fresh */ }
      const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>
      const preToolUse = (hooks.PreToolUse ?? []) as Array<{ matcher?: string; hooks?: unknown[] }>
      const alreadyInstalled = preToolUse.some((h) =>
        h.matcher === "AskUserQuestion" && Array.isArray(h.hooks) && h.hooks.some((hk) => {
          const cmd = (hk as { command?: unknown }).command
          return typeof cmd === "string" && cmd.includes("huxflux-ask-user")
        })
      )
      if (!alreadyInstalled) {
        preToolUse.push({
          matcher: "AskUserQuestion",
          hooks: [{ type: "command", command: scriptPath, timeout: 300 }],
        })
        hooks.PreToolUse = preToolUse
        settings.hooks = hooks
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
      }
    } catch (hookErr) {
      console.error(`[claude] Failed to install AskUserQuestion hook:`, (hookErr as Error).message)
    }
  },
}
