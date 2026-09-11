import { agentsWs } from "../agents/agents.ws.js"
import { config } from "../../config.js"
import { getProvider } from "../providers/registry.js"
import { buildConversationContext } from "../providers/context.js"
import { buildSandboxedCommand } from "../../sandbox.js"
import type { ProviderAdapter, SpawnResult } from "../providers/providers.types.js"
import type { StreamState } from "../agents/agents.types.js"
import type { RunAgentOptions } from "./agent-runner.types.js"
import { buildHeadroomEnv, ensureHeadroomProxy } from "../headroom/headroom.service.js"
import { runningProcesses, trackTurn } from "./service/processRegistry.js"
import { createStreamState } from "./service/state.js"
import { bootstrapTurn, type BootstrapResult } from "./service/bootstrapTurn.js"
import { buildSystemPrompt } from "./service/systemPrompt.js"
import { spawnAndStream, makeScheduleFlush, buildSpawnEnv } from "./service/streamLoop.js"
import { makeTurnSplitter, registerTurnSplitter, type TurnSegmentRef } from "./service/turnSegments.js"
import { makeFinalize } from "./service/finalize.js"
import { clearBackgroundState } from "./service/backgroundTasks.js"
import { logger } from "../../logger.js"

export {
  runningProcesses,
  getClaudeBin,
  isAgentRunning,
  stopAgent,
  endTurn,
  stopAllRunningTurns,
  resetStreamingFlags,
  resolveModelAlias,
} from "./service/processRegistry.js"

export { answerPendingQuestion, injectUserMessage } from "./service/controlProtocol.js"
export { getBackgroundState } from "./service/backgroundTasks.js"

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

  const headroomBaseUrl = await resolveHeadroomBaseUrl(opts, provider)

  const turn = spawnAndAwaitExit({ userContent, opts, provider, model, apiBase, bootstrap, state, startedAt, headroomBaseUrl })
  trackTurn(agentId, turn)
  return turn
}

/**
 * Base URL of the Headroom compression proxy when this agent opted in, or
 * null. Claude-only: it is the one provider whose CLI honours
 * ANTHROPIC_BASE_URL. A proxy that cannot start is reported into the chat and
 * the turn proceeds uncompressed rather than failing.
 */
async function resolveHeadroomBaseUrl(opts: RunAgentOptions, provider: ProviderAdapter): Promise<string | null> {
  if (!opts.headroom || provider.id !== "claude") return null
  try {
    return await ensureHeadroomProxy()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    logger.warn({ err, agentId: opts.agentId }, "[runner] headroom proxy unavailable")
    agentsWs.errorEmit(opts.agentId, `Headroom proxy unavailable, running without compression: ${reason}`)
    return null
  }
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
  headroomBaseUrl: string | null
}

function spawnAndAwaitExit(args: SpawnAndAwaitArgs): Promise<void> {
  const { userContent, opts, provider, model, apiBase, bootstrap, state, startedAt, headroomBaseUrl } = args
  const { agentId } = opts
  const repo = bootstrap.repoRow?.name ?? "unknown"
  const branch = bootstrap.liveAgentRow?.branch ?? bootstrap.agentRow?.branch ?? "unknown"
  return new Promise((resolve, reject) => {
    const { bin, args: cliArgs, env: providerEnv, stdinInit } = resolveSpawnCommand({ userContent, opts, provider, model, bootstrap })
    const spawnEnv = buildSpawnEnv({
      agentId,
      apiBase,
      authToken: config.authToken,
      cwd: bootstrap.cwd,
      repoPath: bootstrap.repoRow?.path ?? null,
      spawnEnvFromProvider: {
        ...providerEnv,
        ...(headroomBaseUrl ? buildHeadroomEnv(agentId, headroomBaseUrl) : {}),
      },
    })
    // Flush content/thinking to DB periodically so it survives page reloads.
    const flushTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null }
    const turnRef: TurnSegmentRef = {
      messageId: bootstrap.messageId,
      createdAt: bootstrap.skeletonCreatedAt,
      startedAt,
    }
    const scheduleFlush = makeScheduleFlush(state, turnRef, flushTimer)
    const bufferRef = { current: "" }

    const proc = spawnAndStream({
      bin, args: cliArgs, cwd: bootstrap.cwd, env: spawnEnv,
      provider, state, agentId, turnRef, repo, branch, scheduleFlush, bufferRef,
      stdinInit,
    })

    // Mid-run injection splits the turn into visible segments (only meaningful
    // for providers with a stdin pipe; the splitter is inert otherwise).
    registerTurnSplitter(agentId, makeTurnSplitter({ agentId, model, state, turnRef }))

    const finalize = makeFinalize({
      state, agentId, turnRef, model, provider,
      cwd: bootstrap.cwd, branchFrom: bootstrap.branchFrom,
      preRunStatus: bootstrap.preRunStatus, flushTimer, bufferRef, scheduleFlush, opts,
      tags: opts.tags ?? [],
    })

    proc.on("close", async (code) => {
      logger.info(
        { repo, branch, code, fullContentBytes: state.fullContent.length, pendingTextBytes: state.pendingText.length },
        `[runner] ${provider.id} exited code=${code} fullContent=${state.fullContent.length}bytes pendingText=${state.pendingText.length}bytes`,
      )
      if (code && code !== 0 && state.fullContent.length === 0 && state.pendingText.length === 0) {
        const errMsg = `${provider.name} exited with code ${code}. Check the terminal tab for details.`
        state.pendingText = errMsg
        agentsWs.errorEmit(agentId, errMsg)
      }
      clearBackgroundState(agentId)
      await finalize(code)
      resolve()
    })

    proc.on("error", async (err) => {
      clearBackgroundState(agentId)
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
  const { isContinuation, existingSessionId, useContinue, cwd, repoRow } = bootstrap

  const systemPrompt = buildSystemPrompt({
    agentId,
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

  const prompt = opts.turnContext ? `${userContent}\n\n---\n\n${opts.turnContext}` : userContent

  const spawnResult = provider.buildSpawnArgs({
    prompt,
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
  if (config.sandbox && provider.id === "claude") {
    const sandboxed = buildSandboxedCommand({
      claudeBin: spawnResult.bin,
      claudeArgs: spawnResult.args,
      worktreePath: cwd,
      repoPath: repoRow?.path ?? null,
      cfg: config.sandbox,
    })
    return { bin: sandboxed.bin, args: sandboxed.args, env: spawnResult.env, stdinInit: spawnResult.stdinInit }
  }
  return spawnResult
}
