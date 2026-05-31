import type { FastifyInstance } from "fastify"
import { runAgent, isAgentRunning } from "../../agent-runner/agent-runner.service.js"
import { buildChatRunOptions } from "./chatRun.js"
import type { QueuedMessage } from "../agents.types.js"

const agentQueues = new Map<string, QueuedMessage[]>()

export function enqueue(agentId: string, msg: QueuedMessage): void {
  if (!agentQueues.has(agentId)) agentQueues.set(agentId, [])
  agentQueues.get(agentId)!.push(msg)
}

export function drainQueue(agentId: string, app: FastifyInstance): void {
  const queue = agentQueues.get(agentId)
  if (!queue || queue.length === 0) return
  if (isAgentRunning(agentId)) return
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
    .catch((err) => app.log.error(`Claude runner error for agent ${agentId}: ${err}`))
    .finally(() => drainQueue(agentId, app))
}
