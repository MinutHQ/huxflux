export type ProviderId = "claude" | "codex" | "gemini" | "antigravity" | "pi"

export interface ModelCapabilities {
  reasoning?: boolean
  toolCall?: boolean
  structuredOutput?: boolean
  attachment?: boolean
}

export interface ProviderModel {
  id: string
  label: string
  api: string
  contextWindow?: number
  maxOutput?: number
  inputCost?: number
  outputCost?: number
  capabilities?: ModelCapabilities
  effortLevels?: string[]
  defaultEffort?: string
}

export interface ProviderCapabilities {
  sessionResume: boolean
  sessionContinue: boolean
  planMode: boolean
  streamingJson: boolean
  toolUseEvents: boolean
  thinkingBlocks: boolean
  askUserQuestion: boolean
  systemPromptFlag: boolean
  allowedToolsRestriction: boolean
  subAgentSupport: boolean
  effortLevels: string[]  // e.g. ["low","medium","high","max"] or [] if not supported
}

/** Normalized stream event — all providers emit these after parsing their raw output */
export type NormalizedStreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; precedingText?: string }
  | { type: "tool_result"; toolUseId: string; content: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: "session_init"; sessionId: string }
  | { type: "subagent"; toolUseId: string; event: Record<string, unknown> }
  | { type: "done"; result?: string }
  | { type: "error"; message: string }

export interface SpawnOptions {
  prompt: string
  model: string
  planMode: boolean
  sessionId: string | null
  isContinuation: boolean
  cwd: string
  systemPrompt: string
  allowedTools?: string[]
  effort?: string
  /** Full conversation history for providers without session resume */
  conversationContext?: string
}

export interface SpawnResult {
  bin: string
  args: string[]
  env?: Record<string, string>
}

export interface ProviderAdapter {
  id: ProviderId
  name: string
  capabilities: ProviderCapabilities

  /** Resolve the CLI binary path */
  resolveBinary(): string

  /** Check if the CLI is installed (synchronous, O(1) — reads a cached value
   *  populated by `warmAvailability()`). */
  isAvailable(): boolean

  /** Compute and cache the availability result. Called once at server start.
   *  May take several seconds (e.g. `npx` downloading a package); runs in the
   *  background so it does not block the event loop. Optional — providers
   *  whose probe is already fast/sync can omit it. */
  warmAvailability?(): Promise<void>

  /** Build spawn arguments for the CLI process */
  buildSpawnArgs(opts: SpawnOptions): SpawnResult

  /** Parse a single line of stdout into a normalized event (or null to skip) */
  parseStreamLine(line: string): NormalizedStreamEvent | null

  /** Resolve a display model name to the API model ID */
  resolveModel(model: string): string

  /** Get the list of available models for this provider */
  getModels(): ProviderModel[]

  /** Install any hooks needed (e.g. AskUserQuestion for Claude). No-op for most providers. */
  installHooks?(agentId: string, cwd: string, apiBase: string, authToken: string): Promise<void>

  /** Path to the CLI's own transcript for `sessionId` under `cwd`, when the CLI
   *  keeps one somewhere the server can stat. The runner probes this before
   *  reusing a stored session id, so a session that vanished (worktree moved,
   *  transcript pruned) degrades to replayed context instead of the CLI failing.
   *  Providers that store session state elsewhere — or nowhere visible — omit
   *  this and are trusted to resolve their own session ids. */
  sessionFilePath?(cwd: string, sessionId: string): string

  /** Path whose presence means the CLI has resumable history in `cwd`, probed
   *  before passing a `--continue`-style flag. Omit to always pass it when the
   *  turn is a continuation and the provider declares `sessionContinue`. */
  continueProbePath?(cwd: string): string
}
