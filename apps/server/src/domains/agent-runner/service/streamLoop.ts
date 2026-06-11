import { spawn, type ChildProcess } from "node:child_process"
import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { messages as messagesTable, terminalLines as terminalLinesTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type { ProviderAdapter, NormalizedStreamEvent, SpawnResult } from "../../providers/providers.types.js"
import type { ClaudeStreamEvent, StreamState } from "../../agents/agents.types.js"
import { runningProcesses } from "./processRegistry.js"
import { handleStreamEvent } from "./claudeStreamEvent.js"
import { handleNormalizedEvent } from "./normalizedEvent.js"
import { logger } from "../../../logger.js"

interface StreamLoopArgs {
  bin: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  provider: ProviderAdapter
  state: StreamState
  agentId: string
  messageId: string
  repo: string
  branch: string
  scheduleFlush: () => void
  bufferRef: { current: string }
}

/** Spawn the CLI process and wire stdout/stderr into the streaming pipeline. */
export function spawnAndStream(args: StreamLoopArgs): ChildProcess {
  const { bin, args: cliArgs, cwd, env, provider, state, agentId, messageId, repo, branch, scheduleFlush, bufferRef } = args

  const proc = spawn(bin, cliArgs, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  })

  runningProcesses.set(agentId, proc)

  logger.info(
    { repo, branch, pid: proc.pid },
    `[runner] spawned ${provider.id} (${bin}) pid=${proc.pid} args=${cliArgs.slice(0, 5).join(" ")}...`,
  )

  proc.stdout?.on("data", (chunk: Buffer) => {
    processStdoutChunk(chunk, provider, bufferRef, state, agentId, messageId, scheduleFlush)
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

function processStdoutChunk(
  chunk: Buffer,
  provider: ProviderAdapter,
  bufferRef: { current: string },
  state: StreamState,
  agentId: string,
  messageId: string,
  scheduleFlush: () => void,
): void {
  const isClaudeFormat = provider.id === "claude" || provider.id === "claude-interactive"
  if (provider.id === "claude-interactive" || provider.id === "gemini") {
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
        handleStreamEvent(parsed, state, agentId, messageId, scheduleFlush)
      } catch { /* non-JSON */ }
    } else {
      const event = provider.parseStreamLine(line) as NormalizedStreamEvent | null
      logger.info(`[runner:${provider.id}] parsed line → ${event?.type ?? "null"} | line: ${line.slice(0, 100)}`)
      if (event) handleNormalizedEvent(event, state, agentId, messageId, scheduleFlush)
    }
  }
}

/**
 * Build the periodic-flush callback. Flushes pending text + thinking to DB
 * every 500ms while the model is generating so reloads see partial output.
 */
export function makeScheduleFlush(
  state: StreamState,
  messageId: string,
  flushTimer: { current: ReturnType<typeof setTimeout> | null },
): () => void {
  return function scheduleFlush(): void {
    if (flushTimer.current) return
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      db.update(messagesTable)
        .set({ content: state.pendingText, thinking: state.fullThinking || null })
        .where(eq(messagesTable.id, messageId))
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
