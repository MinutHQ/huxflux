import { spawn, type ChildProcess } from "node:child_process"
import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { messages as messagesTable, terminalLines as terminalLinesTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type { ProviderAdapter, NormalizedStreamEvent, SpawnResult } from "../../providers/providers.types.js"
import type { ClaudeStreamEvent, StreamState } from "../../agents/agents.types.js"
import { runningProcesses } from "./processRegistry.js"
import { handleControlRequest, type ControlRequestEvent } from "./controlProtocol.js"
import type { TurnSegmentRef } from "./turnSegments.js"
import { handleStreamEvent } from "./claudeStreamEvent.js"
import { handleNormalizedEvent } from "./normalizedEvent.js"
import { scheduleLingerCheck } from "./backgroundTasks.js"
import { logger } from "../../../logger.js"

interface StreamLoopArgs {
  bin: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  provider: ProviderAdapter
  state: StreamState
  agentId: string
  /** Mutable current-segment identity — mid-run injection swaps the target
   *  message, so every event reads the id at dispatch time. */
  turnRef: TurnSegmentRef
  repo: string
  branch: string
  scheduleFlush: () => void
  bufferRef: { current: string }
  /** Initial stdin line (stream-json user message). When set, stdin stays a
   *  writable pipe for control responses and mid-run message injection. */
  stdinInit?: string
}

/** Spawn the CLI process and wire stdout/stderr into the streaming pipeline. */
export function spawnAndStream(args: StreamLoopArgs): ChildProcess {
  const { bin, args: cliArgs, cwd, env, provider, state, agentId, turnRef, repo, branch, scheduleFlush, bufferRef, stdinInit } = args

  const proc = spawn(bin, cliArgs, {
    cwd,
    stdio: [stdinInit != null ? "pipe" : "ignore", "pipe", "pipe"],
    env,
  })

  runningProcesses.set(agentId, proc)
  if (stdinInit != null) proc.stdin?.write(stdinInit + "\n")
  const progress: TurnProgress = { sawAssistant: false, sawTaskNotification: false, skippedOrphanResult: false }

  logger.info(
    { repo, branch, pid: proc.pid },
    `[runner] spawned ${provider.id} (${bin}) pid=${proc.pid} args=${cliArgs.slice(0, 5).join(" ")}...`,
  )

  proc.stdout?.on("data", (chunk: Buffer) => {
    processStdoutChunk(chunk, provider, bufferRef, state, agentId, turnRef, scheduleFlush, proc, progress)
  })

  proc.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter((l) => l.trim())
    for (const line of lines) {
      const ts = new Date().toISOString()
      db.insert(terminalLinesTable).values({ id: uuid(), agentId, line, createdAt: ts }).run()
      agentsWs.terminalLine(agentId, line)
    }
  })

  return proc
}

/** What this process has emitted so far; decides whether a `result` ends the turn. */
interface TurnProgress {
  /** The model has produced output (any `assistant` event). */
  sawAssistant: boolean
  /** The CLI reported background tasks from a previous process (`system task_notification`). */
  sawTaskNotification: boolean
  /** One pre-turn `result` was already ignored; the next one is terminal no matter what. */
  skippedOrphanResult: boolean
}

function processStdoutChunk(
  chunk: Buffer,
  provider: ProviderAdapter,
  bufferRef: { current: string },
  state: StreamState,
  agentId: string,
  turnRef: TurnSegmentRef,
  scheduleFlush: () => void,
  proc: ChildProcess,
  progress: TurnProgress,
): void {
  const isClaudeFormat = provider.id === "claude"
  if (provider.id === "gemini") {
    logger.info(`[runner:${provider.id}] stdout chunk (${chunk.length}b): ${chunk.toString().slice(0, 200)}`)
  }
  bufferRef.current += chunk.toString()

  let lines: string[]
  if (isClaudeFormat) {
    lines = bufferRef.current.split("\n")
    bufferRef.current = lines.pop() ?? ""
  } else {
    lines = bufferRef.current.replace(/\}\s*\{/g, "}\n{").split("\n")
    bufferRef.current = lines.pop() ?? ""
  }

  for (const line of lines) {
    if (!line.trim()) continue
    if (isClaudeFormat) {
      try {
        const parsed = JSON.parse(line) as ClaudeStreamEvent
        if (parsed.type === "control_request" || parsed.type === "control_cancel_request") {
          handleControlRequest(parsed as ControlRequestEvent, agentId, proc)
          continue
        }
        handleStreamEvent(parsed, state, agentId, turnRef.messageId, scheduleFlush)
        if (parsed.type === "assistant") progress.sawAssistant = true
        if (parsed.type === "system" && parsed.subtype === "task_notification") progress.sawTaskNotification = true
        if (parsed.type === "result") handleResultEvent(parsed, proc, agentId, progress)
      } catch { /* non-JSON */ }
    } else {
      const event = provider.parseStreamLine(line) as NormalizedStreamEvent | null
      logger.info(`[runner:${provider.id}] parsed line → ${event?.type ?? "null"} | line: ${line.slice(0, 100)}`)
      if (event) handleNormalizedEvent(event, state, agentId, turnRef.messageId, scheduleFlush)
    }
  }
}

/**
 * The turn is over — close stdin so the CLI exits instead of waiting for more
 * stream-json input. (An injection racing past this point is still processed
 * by the CLI as a follow-up turn before it exits.) A CLI holding background
 * tasks (Monitor, background Bash) stays alive anyway; the linger check
 * surfaces that to clients.
 *
 * Exception: when a resumed session has background tasks orphaned by the
 * previous process, the CLI first emits `system task_notification` for them,
 * runs that notification as its own query, and emits an empty `result` for it
 * — before it has read our prompt. Closing stdin on that one leaves the real
 * turn without a control channel (AskUserQuestion fails with "Stream closed",
 * injected messages fall back to the queue). That exact signature — a task
 * notification, then a non-error `result` before any `assistant` event — is
 * ignored once. Any other `result` (no notification, an error, the model
 * already spoke, or a second pre-turn result) ends the turn as before, so a
 * turn that legitimately produces no output cannot hang on an open stdin.
 */
function handleResultEvent(
  parsed: ClaudeStreamEvent & { is_error?: boolean },
  proc: ChildProcess,
  agentId: string,
  progress: TurnProgress,
): void {
  const isOrphanNotificationResult =
    progress.sawTaskNotification && !progress.sawAssistant && !parsed.is_error && !progress.skippedOrphanResult
  if (isOrphanNotificationResult) {
    progress.skippedOrphanResult = true
    logger.info({ agentId }, "[runner] result for the orphaned-task notification before any assistant output; keeping stdin open")
    return
  }
  if (proc.stdin && !proc.stdin.destroyed) proc.stdin.end()
  scheduleLingerCheck(agentId, proc)
}

/**
 * Build the periodic-flush callback. Flushes pending text + thinking to DB
 * every 500ms while the model is generating so reloads see partial output.
 */
export function makeScheduleFlush(
  state: StreamState,
  turnRef: TurnSegmentRef,
  flushTimer: { current: ReturnType<typeof setTimeout> | null },
): () => void {
  return function scheduleFlush(): void {
    if (flushTimer.current) return
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      db.update(messagesTable)
        .set({ content: state.pendingText, thinking: state.fullThinking || null })
        .where(eq(messagesTable.id, turnRef.messageId))
        .run()
    }, 500)
  }
}

export interface SpawnEnvArgs {
  agentId: string
  apiBase: string
  authToken: string
  cwd: string
  repoPath: string | null
  spawnEnvFromProvider?: Record<string, string>
}

/** Build the full env passed to the spawned CLI process. */
export function buildSpawnEnv(args: SpawnEnvArgs): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME ?? ""}/.npm-global/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}`,
    HUXFLUX_AGENT_ID: args.agentId,
    HUXFLUX_WORKTREE: args.cwd,
    HUXFLUX_REPO: args.repoPath ?? "",
    HUXFLUX_API_BASE: args.apiBase,
    HUXFLUX_AUTH: args.authToken,
    ...(args.spawnEnvFromProvider ?? {}),
  }
}

export type { SpawnResult }
