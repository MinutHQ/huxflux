// Process shutdown and restart-when-idle.
//
// Every exit path funnels through `exitGracefully`: in-flight agent turns are
// stopped and given a bounded window to finalize (persist the text streamed
// so far, emit `message:done`, clear the streaming flag) before worktree
// processes are killed and the process exits. Without this, a restart cut
// every running turn mid-thought and the client never saw the last message.
//
// SIGUSR2 (sent by the supervisor when the binary on disk changed) asks for a
// restart once no turn is running instead of an immediate stop.

import * as path from "node:path"
import { eq, isNull } from "drizzle-orm"
import { db } from "./db/index.js"
import { agents as agentsTable, repos as reposTable } from "./db/schema.js"
import { killWorktreeProcesses, clearAgentPorts } from "./domains/git/processes.js"
import { stopProxyConnector } from "./domains/proxy-connector/proxy-connector.service.js"
import { stopHeadroomProxy } from "./domains/headroom/headroom.service.js"
import { runningProcesses, stopAllRunningTurns } from "./domains/agent-runner/agent-runner.service.js"
import { logger } from "./logger.js"

/** Exit code the supervisor treats as a planned restart, not a crash. */
export const RESTART_EXIT_CODE = 42

// Budget for in-flight turns to persist their partial message. Must leave
// room inside SHUTDOWN_TIMEOUT_MS for the worktree-process cleanup.
const TURN_DRAIN_MS = 3500
const SHUTDOWN_TIMEOUT_MS = 7000
const IDLE_POLL_MS = 2000
// A restart-when-idle request never waits longer than this: a busy automation
// could otherwise hold an update back indefinitely.
const IDLE_WAIT_CAP_MS = 60 * 60 * 1000

let onExit: () => void = () => {}
let shuttingDown = false
let idleTimer: ReturnType<typeof setInterval> | null = null

async function cleanupOnShutdown(reason: string): Promise<void> {
  const stopped = await stopAllRunningTurns(reason, TURN_DRAIN_MS).catch(() => 0)
  if (stopped > 0) logger.info({ stopped }, "[server] in-flight turns finalized before exit")
  onExit()
  stopProxyConnector()
  await stopHeadroomProxy().catch(() => {})
  try {
    const allAgents = db.select().from(agentsTable).where(isNull(agentsTable.deletedAt)).all()
    // Per-agent kill in parallel — each `lsof` already has a 3s timeout, so
    // total cleanup is bounded by the slowest single agent, not the sum.
    await Promise.all(allAgents.map(async (agent) => {
      if (!agent.repoId) return
      const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
      if (!repo) return
      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      await killWorktreeProcesses(worktreePath).catch(() => {})
      clearAgentPorts(agent.id)
    }))
  } catch { /* best effort */ }
}

/**
 * Stop in-flight turns, clean up, and exit with `code`. Idempotent: a second
 * call while a shutdown is already running forces an immediate exit (the
 * Ctrl+C-twice escape hatch). A hard timeout guarantees the process exits even
 * if cleanup hangs (lsof stuck, db locked, whatever).
 */
export function exitGracefully(code: number, reason: string): void {
  if (shuttingDown) {
    logger.warn(`[server] shutdown already in progress (${reason}); forcing exit`)
    process.exit(code)
  }
  shuttingDown = true
  if (idleTimer) { clearInterval(idleTimer); idleTimer = null }
  const force = setTimeout(() => {
    logger.warn(`[server] cleanup did not complete in ${SHUTDOWN_TIMEOUT_MS}ms; forcing exit`)
    process.exit(code)
  }, SHUTDOWN_TIMEOUT_MS)
  // Don't let the timer itself hold the loop open if cleanup finishes fast.
  force.unref()
  void cleanupOnShutdown(reason).finally(() => {
    clearTimeout(force)
    process.exit(code)
  })
}

/**
 * Restart as soon as no agent turn is running. Turns that start while we wait
 * are allowed to finish too; after IDLE_WAIT_CAP_MS the restart proceeds
 * anyway (running turns are then finalized with an "interrupted" note).
 */
export function restartWhenIdle(reason: string): void {
  if (shuttingDown || idleTimer) return
  const deadline = Date.now() + IDLE_WAIT_CAP_MS
  let polls = 0
  const attempt = (): void => {
    const running = runningProcesses.size
    if (running === 0 || Date.now() >= deadline) {
      exitGracefully(RESTART_EXIT_CODE, reason)
      return
    }
    // Log on the first poll and then every ~30s so the wait stays visible
    // without flooding the log every two seconds.
    if (polls++ % 15 === 0) logger.info({ running }, `[server] restart pending (${reason}); waiting for running agents to finish`)
  }
  attempt()
  if (shuttingDown) return
  idleTimer = setInterval(attempt, IDLE_POLL_MS)
  idleTimer.unref()
}

/** Wire process signals. `cleanup` runs on every exit (port + connection files). */
export function installShutdownHandlers(cleanup: () => void): void {
  onExit = cleanup
  process.on("exit", cleanup)
  process.on("SIGTERM", () => exitGracefully(0, "the Huxflux server was stopped"))
  process.on("SIGINT", () => exitGracefully(0, "the Huxflux server was stopped"))
  process.on("SIGUSR2", () => restartWhenIdle("the Huxflux server was updated"))
}
