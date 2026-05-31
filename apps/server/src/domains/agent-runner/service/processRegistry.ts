import { type ChildProcess } from "node:child_process"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable } from "../../../db/schema.js"
import { getProvider } from "../../providers/registry.js"

// Registry of running agent processes
export const runningProcesses = new Map<string, ChildProcess>()

// Legacy: resolve claude binary for backward compat (used by PR review/chat,
// title gen, /api/agents/:id/context). Delegates to the claude provider so
// there's a single cached binary path across the runner and the legacy callers.
export function getClaudeBin(): string {
  return getProvider("claude").resolveBinary()
}

export function stopAgent(agentId: string): boolean {
  const proc = runningProcesses.get(agentId)
  if (!proc) return false
  try {
    // Kill the entire process group so child processes die too
    if (proc.pid) process.kill(-proc.pid, "SIGTERM")
  } catch {
    // Fallback to direct kill
    try { proc.kill("SIGTERM") } catch { /* dead */ }
  }
  // Force kill after 3s if still alive
  setTimeout(() => {
    try {
      if (proc.pid) process.kill(-proc.pid, "SIGKILL")
    } catch { /* dead */ }
    try { proc.kill("SIGKILL") } catch { /* dead */ }
    runningProcesses.delete(agentId)
  }, 3000)
  return true
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
  "Opus 4.7": "claude-opus-4-7",
  "Opus 4.6": "claude-opus-4-6",
  "Sonnet 4.6": "claude-sonnet-4-6",
  "Haiku 4.5": "claude-haiku-4-5",
}

/** Resolve a display name ("Sonnet 4.6") or API id to an API model id. */
export function resolveModelAlias(model: string | undefined, fallback = "claude-sonnet-4-6"): string {
  if (!model) return fallback
  // Already an API id (starts with "claude-")
  if (model.startsWith("claude-")) return model
  return MODEL_ALIASES[model] ?? fallback
}
