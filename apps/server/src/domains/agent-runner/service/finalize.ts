import { eq, sql } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import { config } from "../../../config.js"
import type { Message, AgentSummary } from "../../../types.js"
import type { ProviderAdapter, NormalizedStreamEvent } from "../../providers/providers.types.js"
import type { ClaudeStreamEvent, StreamState } from "../../agents/agents.types.js"
import type { TagHandler, RunAgentOptions } from "../agent-runner.types.js"
import { runningProcesses } from "./processRegistry.js"
import { handleStreamEvent } from "./claudeStreamEvent.js"
import { handleNormalizedEvent } from "./normalizedEvent.js"
import { persistAssistantMessage } from "./persistMessage.js"

interface FinalizeArgs {
  state: StreamState
  agentId: string
  messageId: string
  skeletonCreatedAt: string
  startedAt: number
  model: string
  provider: ProviderAdapter
  cwd: string
  branchFrom: string
  preRunStatus: string
  flushTimer: { current: ReturnType<typeof setTimeout> | null }
  bufferRef: { current: string }
  scheduleFlush: () => void
  opts: RunAgentOptions
  tags: TagHandler[]
}

/**
 * Build the finalize callback. Idempotent — safe to call from every exit path
 * (close success, close catch, spawn error). Guarantees: process map cleared,
 * streaming flag cleared in DB, message:done emitted, agent:updated broadcast.
 */
export function makeFinalize(args: FinalizeArgs): () => Promise<void> {
  let finalized = false
  return async function finalize(): Promise<void> {
    if (finalized) return
    finalized = true
    runningProcesses.delete(args.agentId)

    flushRemainingBuffer(args)
    await persistOrFallback(args)
    sendDelegateReply(args)
    await restoreStatusAndStreaming(args)
  }
}

function flushRemainingBuffer(args: FinalizeArgs): void {
  // Flush any remaining buffered data (last line may lack trailing newline)
  const { bufferRef, provider, state, agentId, messageId, scheduleFlush } = args
  if (!bufferRef.current.trim()) return
  const isClaudeFmt = provider.id === "claude" || provider.id === "claude-interactive"
  const remaining = isClaudeFmt
    ? [bufferRef.current.trim()]
    : bufferRef.current.trim().replace(/\}\s*\{/g, "}\n{").split("\n")
  for (const part of remaining) {
    if (!part.trim()) continue
    if (isClaudeFmt) {
      try {
        handleStreamEvent(JSON.parse(part) as ClaudeStreamEvent, state, agentId, messageId, scheduleFlush)
      } catch { /* non-JSON */ }
    } else {
      const event = provider.parseStreamLine(part) as NormalizedStreamEvent | null
      if (event) handleNormalizedEvent(event, state, agentId, messageId, scheduleFlush)
    }
  }
  bufferRef.current = ""
}

async function persistOrFallback(args: FinalizeArgs): Promise<void> {
  // Persist the final message + emit message:done. Failures here must not
  // prevent the streaming flag from being cleared, so they're swallowed.
  try {
    await persistAssistantMessage({
      state: args.state,
      agentId: args.agentId,
      messageId: args.messageId,
      skeletonCreatedAt: args.skeletonCreatedAt,
      startedAt: args.startedAt,
      model: args.model,
      providerId: args.provider.id,
      worktreePath: args.cwd,
      branchFrom: args.branchFrom,
      flushTimer: args.flushTimer,
      tags: args.tags,
      onAssistantMessage: args.opts.onAssistantMessage,
    })
  } catch (err) {
    console.error(`[runner] persistAssistantMessage failed for ${args.agentId}:`, err)
    // Still emit a done signal with whatever we have so the client unsticks.
    agentsWs.messageDone(args.agentId, args.messageId, {
      id: args.messageId,
      role: "assistant",
      content: args.state.pendingText,
      timestamp: args.skeletonCreatedAt,
      durationMs: Date.now() - args.startedAt,
      toolCalls: args.state.collectedToolCalls.map((tc) => ({ id: tc.id, tool: tc.tool, args: tc.args, result: tc.result, precedingText: tc.precedingText })),
    } as Message)
  }
}

function sendDelegateReply(args: FinalizeArgs): void {
  // If this run was triggered by a delegate from another agent, send the result back
  if (!args.opts.delegateFrom || !args.state.fullContent.trim()) return
  const agentTitle = db.select().from(agentsTable).where(eq(agentsTable.id, args.agentId)).get()?.title ?? "Agent"
  fetch(`http://localhost:${config.boundPort}/api/agents/${args.opts.delegateFrom}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}) },
    body: JSON.stringify({ content: args.state.fullContent.trim(), sender: agentTitle }),
  }).catch((err) => console.error(`[delegate] Failed to reply to ${args.opts.delegateFrom}:`, err))
}

async function restoreStatusAndStreaming(args: FinalizeArgs): Promise<void> {
  // Restore the pre-run status and clear streaming regardless of what
  // happened above. B2: don't downgrade "in-review".
  try {
    const doneAt = new Date().toISOString()
    await db.update(agentsTable)
      .set({
        status: args.preRunStatus === "in-review" ? "in-review" : "in-progress",
        streaming: 0,
        unread: sql`unread + 1`,
        updatedAt: doneAt,
      })
      .where(eq(agentsTable.id, args.agentId))

    const finalAgent = db.select().from(agentsTable).where(eq(agentsTable.id, args.agentId)).get()
    if (finalAgent) agentsWs.agentUpdated(finalAgent as unknown as AgentSummary)
  } catch (err) {
    console.error(`[runner] failed to clear streaming flag for ${args.agentId}:`, err)
  }
}
