// Claude via `@anthropic-ai/claude-agent-sdk`, driven in-process through
// `query()` instead of spawning the `claude` CLI ourselves. The SDK still
// starts its own bundled CLI subprocess under the hood, so session transcripts
// land in the same ~/.claude/projects layout the `claude` adapter probes.

import { createRequire } from "node:module"
import { query, type EffortLevel, type Options, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type {
  NormalizedStreamEvent, ProviderAdapter, ProviderCapabilities, ProviderModel,
  RunTurnContext, SpawnOptions, SpawnResult,
} from "../providers.types.js"
import { claudeContinueProbePath, claudeSessionFilePath } from "./claudeSessionPaths.js"
import { getModelsForHarness } from "./modelsCatalog.js"
import { mapSdkMessage, promptTokensOf } from "./agentSdkEvents.js"

const MODEL_ALIASES: Record<string, string> = {
  "Opus 5.5":   "claude-opus-5-5",
  "Opus 5":     "claude-opus-5",
  "Opus 4.8":   "claude-opus-4-8",
  "Opus 4.7":   "claude-opus-4-7",
  "Opus 4.6":   "claude-opus-4-6",
  "Fable 5":    "claude-fable-5",
  "Sonnet 5":   "claude-sonnet-5",
  "Sonnet 4.6": "claude-sonnet-4-6",
  "Haiku 4.5":  "claude-haiku-4-5",
}

const DEFAULT_MODEL = "claude-sonnet-4-6"
const EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"]

const FALLBACK_MODELS: ProviderModel[] = [
  { id: "claude-opus-5-5",           label: "Opus 5.5",   api: "claude-opus-5-5" },
  { id: "claude-opus-5",             label: "Opus 5",     api: "claude-opus-5" },
  { id: "claude-opus-4-8",           label: "Opus 4.8",   api: "claude-opus-4-8" },
  { id: "claude-opus-4-7",           label: "Opus 4.7",   api: "claude-opus-4-7" },
  { id: "claude-opus-4-6",           label: "Opus 4.6",   api: "claude-opus-4-6" },
  { id: "claude-fable-5",            label: "Fable 5",    api: "claude-fable-5" },
  { id: "claude-sonnet-5",           label: "Sonnet 5",   api: "claude-sonnet-5" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6", api: "claude-sonnet-4-6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",  api: "claude-haiku-4-5-20251001" },
]

function withEffort(models: ProviderModel[]): ProviderModel[] {
  return models.map((m) => ({ ...m, effortLevels: EFFORT_LEVELS, defaultEffort: "high" }))
}

/** Path of the SDK entry module, or null when the package cannot be resolved. */
function resolveSdkPath(): string | null {
  try {
    return createRequire(import.meta.url).resolve("@anthropic-ai/claude-agent-sdk")
  } catch {
    return null
  }
}

const sdkPath = resolveSdkPath()

function toEffort(effort: string | undefined): EffortLevel | undefined {
  return EFFORT_LEVELS.find((level) => level === effort)
}

type QueryContext = Pick<RunTurnContext, "env" | "onStderr" | "requestPermission">

/** Translate the runner's SpawnOptions into SDK query options. Exported for tests. */
export function buildQueryOptions(opts: SpawnOptions, model: string, ctx: QueryContext, abortController: AbortController): Options {
  const resume = opts.sessionId ?? undefined
  return {
    cwd: opts.cwd,
    model,
    abortController,
    env: ctx.env,
    stderr: ctx.onStderr,
    // Permission prompts go to the host. Under bypassPermissions only
    // AskUserQuestion asks (the CLI adapter's `--permission-prompt-tool stdio`
    // equivalent); the runner parks it for the UI and answers with the
    // user's choices in `updatedInput`, denying everything else.
    canUseTool: (toolName, input, { signal, toolUseID }) => ctx.requestPermission({ toolName, input, toolUseId: toolUseID, signal }),
    // The CLI adapter forwards every sub-agent event to the UI; match it.
    forwardSubagentText: true,
    // Keep Claude Code's own system prompt and append ours, matching the CLI
    // adapter's `--append-system-prompt`.
    systemPrompt: { type: "preset", preset: "claude_code", append: opts.systemPrompt },
    // The SDK loads no settings by default; the CLI adapter picks up the
    // user's ~/.claude and the repo's CLAUDE.md, so do the same here.
    settingSources: ["user", "project", "local"],
    permissionMode: opts.planMode ? "plan" : "bypassPermissions",
    allowDangerouslySkipPermissions: !opts.planMode,
    allowedTools: [...(opts.allowedTools ?? []), "AskUserQuestion"],
    ...(toEffort(opts.effort) ? { effort: toEffort(opts.effort) } : {}),
    ...(resume ? { resume } : {}),
    ...(!resume && opts.isContinuation ? { continue: true } : {}),
  }
}

function userMessage(text: string): SDKUserMessage {
  return { type: "user", message: { role: "user", content: [{ type: "text", text }] }, parent_tool_use_id: null }
}

/**
 * Streaming-input prompt: the initial user message, then every message the
 * host injects mid-run. The SDK keeps the session open until this iterable
 * ends, which the runner triggers by closing the turn's input after `done`.
 * Exported for tests.
 */
export async function* buildPromptStream(initial: string, injected: AsyncIterable<string>): AsyncIterable<SDKUserMessage> {
  yield userMessage(initial)
  for await (const text of injected) yield userMessage(text)
}

export const agentSdkProvider: ProviderAdapter = {
  id: "agent-sdk",
  name: "Claude Agent SDK",

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
    taskListTools: true,
    effortLevels: EFFORT_LEVELS,
  } satisfies ProviderCapabilities,

  resolveBinary(): string {
    return sdkPath ?? "@anthropic-ai/claude-agent-sdk"
  },

  isAvailable(): boolean {
    return sdkPath !== null
  },

  buildSpawnArgs(_opts: SpawnOptions): SpawnResult {
    // The runner never calls this for a provider that implements runTurn.
    throw new Error("agent-sdk runs in-process; use runTurn()")
  },

  async *runTurn(opts: SpawnOptions, ctx: RunTurnContext): AsyncIterable<NormalizedStreamEvent> {
    const abortController = new AbortController()
    const forwardAbort = (): void => abortController.abort()
    if (ctx.signal.aborted) return
    ctx.signal.addEventListener("abort", forwardAbort, { once: true })

    const model = this.resolveModel(opts.model)
    const turn = query({
      prompt: buildPromptStream(opts.prompt, ctx.userMessages),
      options: buildQueryOptions(opts, model, ctx, abortController),
    })
    let contextTokens: number | null = null
    try {
      for await (const message of turn as AsyncIterable<SDKMessage>) {
        contextTokens = promptTokensOf(message) ?? contextTokens
        for (const event of mapSdkMessage(message, contextTokens)) yield event
      }
    } finally {
      ctx.signal.removeEventListener("abort", forwardAbort)
      turn.close()
    }
  },

  parseStreamLine(line: string): NormalizedStreamEvent | null {
    // Kept for interface parity: the same mapping the in-process loop uses,
    // applied to one serialized SDK message. Only the first event survives.
    let message: SDKMessage
    try {
      message = JSON.parse(line) as SDKMessage
    } catch {
      return null
    }
    return mapSdkMessage(message, null)[0] ?? null
  },

  resolveModel(model: string): string {
    if (!model) return DEFAULT_MODEL
    if (model.startsWith("claude-")) return model
    if (MODEL_ALIASES[model]) return MODEL_ALIASES[model]
    const match = this.getModels().find((m) => m.id === model || m.label === model)
    return match?.api ?? DEFAULT_MODEL
  },

  getModels(): ProviderModel[] {
    return withEffort(getModelsForHarness("claude") ?? FALLBACK_MODELS)
  },

  sessionFilePath(cwd: string, sessionId: string): string {
    return claudeSessionFilePath(cwd, sessionId)
  },

  continueProbePath(cwd: string): string {
    return claudeContinueProbePath(cwd)
  },
}
