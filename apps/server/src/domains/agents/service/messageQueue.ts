import { runAgent, isAgentRunning } from "../../agent-runner/agent-runner.service.js"
import { buildChatRunOptions } from "./chatRun.js"
import type { QueuedMessage } from "../agents.types.js"
import { logger } from "../../../logger.js"

const agentQueues = new Map<string, QueuedMessage[]>()
const draining = new Set<string>()

export function enqueue(agentId: string, msg: QueuedMessage): void {
  if (!agentQueues.has(agentId)) agentQueues.set(agentId, [])
  agentQueues.get(agentId)!.push(msg)
}

export function clearQueue(agentId: string): number {
  const queue = agentQueues.get(agentId)
  if (!queue) return 0
  const count = queue.length
  agentQueues.delete(agentId)
  return count
}

export function drainQueue(agentId: string): void {
  if (draining.has(agentId)) return
  const queue = agentQueues.get(agentId)
  if (!queue || queue.length === 0) return
  if (isAgentRunning(agentId)) return

  draining.add(agentId)
  const next = queue.shift()!

  runAgent(next.content, buildChatRunOptions({
    agentId,
    worktreePath: next.worktreePath,
    model: next.model,
    planMode: next.planMode,
    delegateFrom: next.delegateFrom,
    sender: next.sender,
    provider: next.provider,
    effort: next.effort,
  }))
    .catch((err) => logger.error({ err, agentId }, "[queue] runner error for queued message"))
    .finally(() => {
      draining.delete(agentId)
      drainQueue(agentId)
    })
}
