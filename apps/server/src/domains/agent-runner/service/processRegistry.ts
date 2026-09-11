import path from "node:path"
import { type ChildProcess } from "node:child_process"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { getProvider } from "../../providers/registry.js"
import { killWorktreeProcesses } from "../../git/processes.js"
import { logger } from "../../../logger.js"

// Registry of running agent processes
export const runningProcesses = new Map<string, ChildProcess>()

// Promise of each in-flight turn (resolves once finalize has run). Lets the
// shutdown path wait for the partial message to be persisted before exiting.
const turnPromises = new Map<string, Promise<void>>()

// Why a turn was stopped, when the stop came from the server rather than the
// user (e.g. a restart). Consumed once by finalize and appended to the
// message so the transcript says why the agent went quiet.
const stopReasons = new Map<string, string>()

export function trackTurn(agentId: string, turn: Promise<void>): void {
  turnPromises.set(agentId, turn)
  turn.catch(() => {}).finally(() => {
    if (turnPromises.get(agentId) === turn) turnPromises.delete(agentId)
  })
}

export function takeStopReason(agentId: string): string | undefined {
  const reason = stopReasons.get(agentId)
  stopReasons.delete(agentId)
  return reason
}

/**
 * Stop every running turn and wait (bounded) for each to finalize, so the
 * text streamed so far is persisted and `message:done` reaches the clients
 * before the process exits. Returns the number of turns that were running.
 */
export async function stopAllRunningTurns(reason: string, timeoutMs: number): Promise<number> {
  const agentIds = [...runningProcesses.keys()]
  if (agentIds.length === 0) return 0
  logger.info({ agentIds, reason }, "[runner] stopping running turns")
  const pending = agentIds.map((id) => turnPromises.get(id)).filter((p): p is Promise<void> => !!p)
  for (const id of agentIds) stopAgent(id, reason)
  await Promise.race([
    Promise.allSettled(pending),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ])
  return agentIds.length
}

// Legacy: resolve claude binary for backward compat (used by PR review/chat,
// title gen). Delegates to the claude provider so
// there's a single cached binary path across the runner and the legacy callers.
export function getClaudeBin(): string {
  return getProvider("claude").resolveBinary()
}

export function stopAgent(agentId: string, reason?: string): boolean {
  const proc = runningProcesses.get(agentId)
  if (!proc) return false
  if (reason) stopReasons.set(agentId, reason)
  try {
    // Kill the entire process group so child processes die too
    if (proc.pid) process.kill(-proc.pid, "SIGTERM")
  } catch {
    // Fallback to direct kill
    try { proc.kill("SIGTERM") } catch { /* dead */ }
  }
  // Force kill after 5s if still alive. Also clear streaming flag as a safety
  // net in case the close event never fires (zombie process).
  setTimeout(() => {
    try {
      if (proc.pid) process.kill(-proc.pid, "SIGKILL")
    } catch { /* dead */ }
    try { proc.kill("SIGKILL") } catch { /* dead */ }
    if (runningProcesses.has(agentId)) {
      runningProcesses.delete(agentId)
      db.update(agentsTable).set({ streaming: 0 }).where(eq(agentsTable.id, agentId)).run()
    }
    // Kill orphaned tool processes (eslint, dev servers, etc.) that the CLI
    // spawned in separate process groups and couldn't clean up in time.
    cleanupOrphanedProcesses(agentId)
  }, 5000)
  return true
}

/**
 * End the turn by terminating only the CLI process. Unlike `stopAgent` this
 * leaves the worktree's own processes (dev servers, long-running scripts the
 * agent started) untouched — it is for a CLI that outlived its final result
 * because of background tasks, not for aborting the agent's work.
 */
export function endTurn(agentId: string): boolean {
  const proc = runningProcesses.get(agentId)
  if (!proc?.pid) return false
  try { proc.kill("SIGTERM") } catch { /* dead */ }
  setTimeout(() => {
    if (proc.exitCode !== null || proc.signalCode !== null) return
    try { proc.kill("SIGKILL") } catch { /* dead */ }
  }, 5000).unref()
  return true
}

function cleanupOrphanedProcesses(agentId: string): void {
  try {
    const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    if (!agent?.repoId) return
    const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
    if (!repo) return
    const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
    killWorktreeProcesses(worktreePath).then(({ killed }) => {
      if (killed > 0) logger.info({ agentId, killed, worktreePath }, "[stopAgent] cleaned up orphaned processes")
    }).catch(() => {})
  } catch { /* best effort */ }
}

export function isAgentRunning(agentId: string): boolean {
  return runningProcesses.has(agentId)
}

// Clears any stale streaming=1 rows at startup. The in-memory runningProcesses
// Map is empty on boot, so any row claiming to stream is a leftover from a
// previous process that died mid-run.
export function resetStreamingFlags(): void {
  db.update(agentsTable).set({ streaming: 0 }).where(eq(agentsTable.streaming, 1)).run()
}

const MODEL_ALIASES: Record<string, string> = {
  "Opus 4.8":   "claude-opus-4-8",
  "Opus 4.7":   "claude-opus-4-7",
  "Opus 4.6":   "claude-opus-4-6",
  "Sonnet 5":   "claude-sonnet-5",
  "Sonnet 4.6": "claude-sonnet-4-6",
  "Haiku 4.5":  "claude-haiku-4-5",
}

/** Resolve a display name ("Sonnet 4.6") or API id to an API model id. */
export function resolveModelAlias(model: string | undefined, fallback = "claude-sonnet-4-6"): string {
  if (!model) return fallback
  // Already an API id (starts with "claude-")
  if (model.startsWith("claude-")) return model
  return MODEL_ALIASES[model] ?? fallback
}
