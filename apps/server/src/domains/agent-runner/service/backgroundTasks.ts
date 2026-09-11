import type { ChildProcess } from "node:child_process"
import type { BackgroundTask, BackgroundState } from "@huxflux/shared"
import { agentsWs } from "../../agents/agents.ws.js"
import { runningProcesses } from "./processRegistry.js"

// Per-agent record of the background work the CLI started during the current
// turn, plus whether the CLI is still alive after emitting its final `result`.
// In-memory only: the state is tied to the running process and is wiped when
// it exits, so there's nothing meaningful to persist.
const backgroundStates = new Map<string, BackgroundState>()

/** Delay after `result` before we call a still-alive CLI "lingering". */
const LINGER_GRACE_MS = 1500

const emptyState = (): BackgroundState => ({ tasks: [], lingering: false })

export function getBackgroundState(agentId: string): BackgroundState {
  return backgroundStates.get(agentId) ?? emptyState()
}

function setState(agentId: string, state: BackgroundState): void {
  backgroundStates.set(agentId, state)
  agentsWs.backgroundState(agentId, state)
}

interface ToolUseBlock {
  id: string
  name: string
  input: unknown
}

/**
 * Derive a background task from a tool_use block, or `null` when the tool
 * does not leave work running after it returns. Recognised today:
 * - `Monitor` (always background; `persistent` keeps it past the first event)
 * - `Bash` with `run_in_background: true`
 */
export function toBackgroundTask(block: ToolUseBlock, now = new Date()): BackgroundTask | null {
  const input = isRecord(block.input) ? block.input : {}
  const command = typeof input.command === "string" ? input.command : undefined
  const description = typeof input.description === "string" ? input.description : undefined
  const base = {
    toolUseId: block.id,
    label: description ?? command ?? block.name,
    command,
    startedAt: now.toISOString(),
  }
  if (block.name === "Monitor") {
    return { ...base, kind: "monitor", persistent: input.persistent === true }
  }
  if (block.name === "Bash" && input.run_in_background === true) {
    return { ...base, kind: "bash" }
  }
  return null
}

/** Pull the CLI task id out of a Monitor / background-Bash tool result. */
export function parseTaskId(result: string): string | undefined {
  const match = /\btask (\w+)|\bID:?\s*(\w+)/i.exec(result)
  return match?.[1] ?? match?.[2]
}

/** Record a tool_use if it starts background work. */
export function noteBackgroundToolUse(agentId: string, block: ToolUseBlock): void {
  const current = getBackgroundState(agentId)
  if (block.name === "TaskStop") {
    const input = isRecord(block.input) ? block.input : {}
    const taskId = typeof input.task_id === "string" ? input.task_id : undefined
    if (!taskId) return
    const remaining = current.tasks.filter((t) => t.taskId !== taskId)
    if (remaining.length !== current.tasks.length) setState(agentId, { ...current, tasks: remaining })
    return
  }
  const task = toBackgroundTask(block)
  if (!task) return
  if (current.tasks.some((t) => t.toolUseId === task.toolUseId)) return
  setState(agentId, { ...current, tasks: [...current.tasks, task] })
}

/** Attach the CLI task id once the tool result for a tracked tool_use arrives. */
export function noteBackgroundToolResult(agentId: string, toolUseId: string, result: string): void {
  const current = backgroundStates.get(agentId)
  if (!current) return
  const task = current.tasks.find((t) => t.toolUseId === toolUseId)
  if (!task || task.taskId) return
  const taskId = parseTaskId(result)
  if (!taskId) return
  setState(agentId, {
    ...current,
    tasks: current.tasks.map((t) => (t.toolUseId === toolUseId ? { ...t, taskId } : t)),
  })
}

/**
 * Called when the CLI emits its final `result`. If the same process is still
 * alive shortly after, flag the agent as lingering so clients can explain why
 * the turn has not closed.
 */
export function scheduleLingerCheck(agentId: string, proc: ChildProcess): void {
  setTimeout(() => {
    if (runningProcesses.get(agentId) !== proc || proc.exitCode !== null || proc.signalCode !== null) return
    const current = getBackgroundState(agentId)
    if (current.lingering) return
    setState(agentId, { ...current, lingering: true })
  }, LINGER_GRACE_MS).unref()
}

/** The CLI exited: drop the record and tell clients the state is clear. */
export function clearBackgroundState(agentId: string): void {
  const had = backgroundStates.delete(agentId)
  if (had) agentsWs.backgroundState(agentId, emptyState())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
