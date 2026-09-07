// `/clear` for an agent: the Huxflux equivalent of Claude Code's `/clear`.
//
// Wipes every persisted message (and its tool calls) for the agent and drops
// the provider session id, so the next turn bootstraps as a first turn: no
// `--resume`, and `buildConversationContext` has nothing to replay for
// providers without native session resume. The agent itself (worktree,
// branch, status, title, file changes) is untouched.
//
// Refused while a turn is running — the caller must stop the agent first.

import { eq, inArray } from "drizzle-orm"
import { CLEAR_COMMAND } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents as agentsTable, messages as messagesTable, toolCalls as toolCallsTable } from "../../../db/schema.js"
import { isAgentRunning } from "../../agent-runner/agent-runner.service.js"
import { agentsWs } from "../agents.ws.js"
import { clearQueue } from "./messageQueue.js"

export type ClearConversationResult =
  | { ok: true; deletedMessages: number }
  | { ok: false; reason: "not-found" | "running" }

export function isClearCommand(content: string): boolean {
  return content.trim() === CLEAR_COMMAND
}

export function clearConversation(agentId: string): ClearConversationResult {
  const agent = db.select({ id: agentsTable.id }).from(agentsTable)
    .where(eq(agentsTable.id, agentId)).get()
  if (!agent) return { ok: false, reason: "not-found" }
  if (isAgentRunning(agentId)) return { ok: false, reason: "running" }

  // Anything still queued for this agent was written against the old
  // context; delivering it after the wipe would be surprising.
  clearQueue(agentId)

  const msgIds = db.select({ id: messagesTable.id }).from(messagesTable)
    .where(eq(messagesTable.agentId, agentId)).all().map((m) => m.id)

  if (msgIds.length > 0) {
    // Explicit delete rather than relying on the FK cascade so the wipe does
    // not depend on the `foreign_keys` pragma being on.
    db.delete(toolCallsTable).where(inArray(toolCallsTable.messageId, msgIds)).run()
    db.delete(messagesTable).where(eq(messagesTable.agentId, agentId)).run()
  }

  db.update(agentsTable)
    .set({ sessionId: null, updatedAt: new Date().toISOString() })
    .where(eq(agentsTable.id, agentId))
    .run()

  agentsWs.messagesCleared(agentId)
  return { ok: true, deletedMessages: msgIds.length }
}
