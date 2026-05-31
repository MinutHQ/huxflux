import * as path from "node:path"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import {
  agents as agentsTable,
  messages as messagesTable,
  repos as reposTable,
  toolCalls as toolCallsTable,
} from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type { Message } from "../../../types.js"
import type { StreamState, CollectedToolCall } from "../../agents/agents.types.js"
import type { TagHandler } from "../agent-runner.types.js"
import { tryAutoRename } from "./autoRename.js"
import { refreshFileChanges } from "./fileChanges.js"
import { parseTagsFromText, dispatchTags, stripTagsFromBody } from "./tagParser.js"

interface PersistArgs {
  state: StreamState
  agentId: string
  messageId: string
  skeletonCreatedAt: string
  startedAt: number
  model: string
  providerId: string
  worktreePath: string
  branchFrom: string
  flushTimer: { current: ReturnType<typeof setTimeout> | null }
  tags: TagHandler[]
  onAssistantMessage?: (event: { content: string }) => void | Promise<void>
}

/**
 * Finalize an assistant turn: parse + dispatch caller-provided tags, persist
 * the message + tool calls, emit `message:done`, and refresh file changes.
 *
 * The runner has no per-tag knowledge here. Every directive is dispatched via
 * `dispatchTags` against the `tags` array supplied by the call site, and all
 * `<huxflux:*>` directives are stripped from the persisted body so they never
 * leak into the visible chat history.
 */
export async function persistAssistantMessage(args: PersistArgs): Promise<void> {
  const { state, agentId, messageId, skeletonCreatedAt, startedAt, model, providerId, branchFrom, flushTimer, tags, onAssistantMessage } = args

  // Cancel any pending flush — we're about to write the final state
  if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null }

  // Dispatch every caller-registered tag found in the full streamed content.
  // We parse from fullContent (not finalContent) so handlers see directives
  // that streamed before tool calls reset the pendingText buffer.
  const parsed = parseTagsFromText(state.fullContent)
  await dispatchTags(parsed, tags)

  // Fallback: derive title + branch from the first user message if the agent
  // never emitted the rename tags and is still on the random-bee placeholder.
  await tryAutoRename(agentId, branchFrom)

  // Strip every huxflux tag from the visible message body + tool-call
  // preceding text so the persisted chat is clean.
  state.fullContent = stripTagsFromBody(state.fullContent)
  stripHuxfluxTagsFromToolCalls(state.collectedToolCalls)

  const finalContent = stripTagsFromBody(computeFinalContent(state, providerId))

  await writeAssistantRow(messageId, finalContent, state, model, startedAt)
  await updateToolCallResults(state.collectedToolCalls)

  const builtMessage = buildMessage(messageId, finalContent, state, skeletonCreatedAt, startedAt, model)

  // Emit message:done immediately after the message is persisted with
  // durationMs set — this clears the client loading state regardless of what
  // happens next.
  agentsWs.messageDone(agentId, messageId, builtMessage)

  if (onAssistantMessage && finalContent) {
    try {
      await onAssistantMessage({ content: finalContent })
    } catch (err) {
      console.error(`[runner] onAssistantMessage hook failed for ${agentId}:`, err)
    }
  }

  // Refresh file changes after emitting so the client query cache is warm
  // by the time it re-fetches. Failures here don't affect the done signal.
  // Re-derive the worktree path here — tag handlers and tryAutoRename above
  // may have moved the worktree, so the original `args.worktreePath` can be
  // stale. Skip entirely for folder repos (no git baseline).
  const refreshed = resolveRefreshedWorktree(agentId, args.worktreePath)
  if (refreshed) {
    await refreshFileChanges(agentId, refreshed, branchFrom)
  }
}

/**
 * After tag dispatch + auto-rename, re-read the agent + repo so we know the
 * current worktree path. Returns `null` for folder repos (file-change tracking
 * is git-based and meaningless without a baseline).
 */
function resolveRefreshedWorktree(agentId: string, fallback: string): string | null {
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!agent) return fallback
  if (!agent.repoId) return fallback
  const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
  if (!repo) return fallback
  if (repo.type === "folder") return null
  return agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
}

// ── content extraction ─────────────────────────────────────────────────────

function computeFinalContent(state: StreamState, providerId: string): string {
  // For Claude: only text after the last tool call becomes content (pendingText).
  // For other providers: use fullContent since they don't split text into precedingText.
  // If ExitPlanMode exists, use its precedingText as the plan content.
  let finalContent = providerId === "claude" ? state.pendingText : (state.fullContent || state.pendingText)
  const exitCall = state.collectedToolCalls.find((tc) => tc.tool === "ExitPlanMode")
  if (exitCall?.precedingText?.trim()) {
    finalContent = exitCall.precedingText.trim()
  }
  return finalContent
}

function stripHuxfluxTagsFromToolCalls(toolCalls: CollectedToolCall[]): void {
  for (const tc of toolCalls) {
    if (!tc.precedingText) continue
    const stripped = stripTagsFromBody(tc.precedingText)
    if (stripped === tc.precedingText) continue
    tc.precedingText = stripped
    if (tc.id) {
      db.update(toolCallsTable)
        .set({ precedingText: tc.precedingText || null })
        .where(eq(toolCallsTable.id, tc.id))
        .run()
    }
  }
}

// ── DB writes ──────────────────────────────────────────────────────────────

async function writeAssistantRow(
  messageId: string,
  finalContent: string,
  state: StreamState,
  model: string,
  startedAt: number,
): Promise<void> {
  await db.update(messagesTable)
    .set({
      content: finalContent,
      thinking: state.fullThinking || null,
      durationMs: Date.now() - startedAt,
      model,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
    })
    .where(eq(messagesTable.id, messageId))
}

async function updateToolCallResults(toolCalls: CollectedToolCall[]): Promise<void> {
  // Update tool call results (they're already inserted; just ensure final state)
  for (const tc of toolCalls) {
    if (tc.result === undefined) continue
    await db.update(toolCallsTable)
      .set({ result: tc.result })
      .where(eq(toolCallsTable.id, tc.id))
  }
}

function buildMessage(
  messageId: string,
  finalContent: string,
  state: StreamState,
  skeletonCreatedAt: string,
  startedAt: number,
  model: string,
): Message {
  return {
    id: messageId,
    role: "assistant",
    content: finalContent,
    thinking: state.fullThinking || undefined,
    timestamp: skeletonCreatedAt,
    durationMs: Date.now() - startedAt,
    model,
    inputTokens: state.inputTokens ?? undefined,
    outputTokens: state.outputTokens ?? undefined,
    cacheReadTokens: state.cacheReadTokens ?? undefined,
    cacheWriteTokens: state.cacheWriteTokens ?? undefined,
    toolCalls: state.collectedToolCalls.map((tc) => ({
      id: tc.id,
      tool: tc.tool,
      args: tc.args,
      result: tc.result,
      precedingText: tc.precedingText,
    })),
  }
}

