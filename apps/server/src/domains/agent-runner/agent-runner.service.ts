import { agentsWs } from "../agents/agents.ws.js"
import { config } from "../../config.js"
import { getProvider } from "../providers/registry.js"
import { buildConversationContext } from "../providers/context.js"
import { buildSandboxedCommand } from "../../sandbox.js"
import type { ProviderAdapter, SpawnResult } from "../providers/providers.types.js"
import type { StreamState } from "../agents/agents.types.js"
import type { RunAgentOptions } from "./agent-runner.types.js"
import { runningProcesses } from "./service/processRegistry.js"
import { createStreamState } from "./service/state.js"
import { bootstrapTurn, type BootstrapResult } from "./service/bootstrapTurn.js"
import { buildSystemPrompt } from "./service/systemPrompt.js"
import { spawnAndStream, makeScheduleFlush, buildSpawnEnv } from "./service/streamLoop.js"
import { makeFinalize } from "./service/finalize.js"

export {
  runningProcesses,
  getClaudeBin,
  isAgentRunning,
  stopAgent,
  resetStreamingFlags,
  resolveModelAlias,
} from "./service/processRegistry.js"

export type { ParsedTag, TagHandler, RunAgentOptions } from "./agent-runner.types.js"

/**
 * Run an assistant turn for the given agent.
 *
 * Bootstraps the turn (user message, agent state, pre-spawn rename), spawns
 * the provider CLI, streams events into DB + WS, and finalizes on exit.
 *
 * The runner is domain-agnostic: callers supply `opts.tags` to wire any
 * `<huxflux:NAMESPACE.KIND>` directives the model emits to their own
 * side-effects (title rename, task mutations, automation steps, etc.).
 */
export async function runAgent(userContent: string, opts: RunAgentOptions): Promise<void> {
  const { agentId } = opts
  const provider = getProvider(opts.provider ?? "claude")
  const model = provider.resolveModel(opts.model ?? "")

  if (!provider.isAvailable()) {
    throw new Error(`${provider.name} CLI is not installed. Install it to use this provider.`)
  }
  if (runningProcesses.has(agentId)) {
    // B1: Reject if a process is already running for this agent
    throw new Error(`Agent ${agentId} already has a running process`)
  }

  const bootstrap = await bootstrapTurn(userContent, opts, provider)
  const state = createStreamState()
  const startedAt = Date.now()

  // Install provider-specific hooks (e.g. AskUserQuestion for Claude).
  // Use 127.0.0.1 instead of `localhost` so DNS hiccups can't break hook calls.
  const apiBase = `http://127.0.0.1:${config.boundPort}`
  if (provider.installHooks && provider.capabilities.askUserQuestion) {
    await provider.installHooks(agentId, bootstrap.cwd, apiBase, config.authToken)
  }

  return spawnAndAwaitExit({ userContent, opts, provider, model, apiBase, bootstrap, state, startedAt })
}

interface SpawnAndAwaitArgs {
  userContent: string
  opts: RunAgentOptions
  provider: ProviderAdapter
  model: string
  apiBase: string
  bootstrap: BootstrapResult
  state: StreamState
  startedAt: number
}

function spawnAndAwaitExit(args: SpawnAndAwaitArgs): Promise<void> {
  const { userContent, opts, provider, model, apiBase, bootstrap, state, startedAt } = args
  const { agentId } = opts
  return new Promise((resolve, reject) => {
    const { bin, args: cliArgs, env: providerEnv } = resolveSpawnCommand({ userContent, opts, provider, model, bootstrap })
    const spawnEnv = buildSpawnEnv({
      agentId,
      apiBase,
      authToken: config.authToken,
      cwd: bootstrap.cwd,
      repoPath: bootstrap.repoRow?.path ?? null,
      spawnEnvFromProvider: providerEnv,
    })
    // Flush content/thinking to DB periodically so it survives page reloads.
    const flushTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null }
    const scheduleFlush = makeScheduleFlush(state, bootstrap.messageId, flushTimer)
    const bufferRef = { current: "" }

    const proc = spawnAndStream({
      bin, args: cliArgs, cwd: bootstrap.cwd, env: spawnEnv,
      provider, state, agentId, messageId: bootstrap.messageId, scheduleFlush, bufferRef,
    })

    const finalize = makeFinalize({
      state, agentId, messageId: bootstrap.messageId,
      skeletonCreatedAt: bootstrap.skeletonCreatedAt, startedAt, model, provider,
      cwd: bootstrap.cwd, branchFrom: bootstrap.branchFrom,
      preRunStatus: bootstrap.preRunStatus, flushTimer, bufferRef, scheduleFlush, opts,
      tags: opts.tags ?? [],
    })

    proc.on("close", async (code) => {
      console.info(`[runner] ${provider.id} exited code=${code} fullContent=${state.fullContent.length}bytes pendingText=${state.pendingText.length}bytes`)
      await finalize()
      resolve()
    })

    proc.on("error", async (err) => {
      agentsWs.errorEmit(agentId, `Failed to spawn claude: ${err.message}`)
      await finalize()
      reject(err)
    })
  })
}

interface ResolveSpawnArgs {
  userContent: string
  opts: RunAgentOptions
  provider: ProviderAdapter
  model: string
  bootstrap: BootstrapResult
}

function resolveSpawnCommand(args: ResolveSpawnArgs): SpawnResult {
  // Returns { bin, args, env } — bin/args may come from the sandbox wrapper but
  // env always comes from the unsandboxed provider result (the original code
  // destructured `{ bin, args }` from the sandbox return and read `env` from
  // the unsandboxed `spawnResult` independently).
  const { userContent, opts, provider, model, bootstrap } = args
  const { agentId } = opts
  const { isContinuation, existingSessionId, useContinue, cwd, agentRow, repoRow, liveAgentRow } = bootstrap

  const systemPrompt = buildSystemPrompt({
    agentId,
    agent: liveAgentRow
      ? {
          id: liveAgentRow.id,
          title: liveAgentRow.title,
          branch: liveAgentRow.branch ?? "",
          prNumber: liveAgentRow.prNumber ?? null,
          threadParentId: agentRow?.threadParentId ?? null,
        }
      : null,
    repo: repoRow ? { branchPrefix: repoRow.branchPrefix ?? null, type: repoRow.type ?? null } : null,
    planMode: opts.planMode ?? false,
    taskContext: opts.taskContext,
    tagInstructions: opts.tagInstructions,
    provider,
  })

  // Build conversation context when provider can't resume from session
  const canResume = provider.capabilities.sessionResume && existingSessionId
  const conversationContext = isContinuation && !canResume
    ? buildConversationContext(agentId)
    : undefined

  const spawnResult = provider.buildSpawnArgs({
    prompt: userContent,
    model,
    planMode: opts.planMode ?? false,
    sessionId: canResume ? existingSessionId : null,
    isContinuation: canResume ? false : (provider.capabilities.sessionContinue ? useContinue : false),
    cwd,
    systemPrompt,
    effort: opts.effort,
    conversationContext,
  })

  // Apply sandboxing if configured (currently Claude-only)
  if (config.sandbox && (provider.id === "claude" || provider.id === "claude-interactive")) {
    const sandboxed = buildSandboxedCommand({
      claudeBin: spawnResult.bin,
      claudeArgs: spawnResult.args,
      worktreePath: cwd,
      repoPath: repoRow?.path ?? null,
      cfg: config.sandbox,
    })
    return { bin: sandboxed.bin, args: sandboxed.args, env: spawnResult.env }
  }
  return spawnResult
}
