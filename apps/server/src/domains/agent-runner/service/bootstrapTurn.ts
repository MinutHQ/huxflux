import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { v4 as uuid } from "uuid"
import { and, eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { messages as messagesTable, agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type { ProviderAdapter } from "../../providers/providers.types.js"
import type { AgentSummary } from "../../../types.js"
import type { RunnerOptions } from "../../agents/agents.types.js"
import { isPlaceholderName } from "../../agents/rename.js"
import { tryAutoRename } from "./autoRename.js"

export interface BootstrapResult {
  messageId: string
  skeletonCreatedAt: string
  isContinuation: boolean
  existingSessionId: string | null
  useContinue: boolean
  cwd: string
  worktreePath: string
  branchFrom: string
  agentRow: typeof agentsTable.$inferSelect | undefined
  repoRow: typeof reposTable.$inferSelect | null
  liveAgentRow: typeof agentsTable.$inferSelect | undefined
  preRunStatus: string
}

/**
 * Run all pre-spawn setup for a turn: persist user message, mark agent as
 * in-progress + streaming, emit `message:start`, run pre-spawn auto-rename,
 * resolve the cwd and session-resume fallbacks. Returns the resolved state
 * the spawn step needs.
 */
export async function bootstrapTurn(
  userContent: string,
  opts: RunnerOptions,
  provider: ProviderAdapter,
): Promise<BootstrapResult> {
  const { agentId } = opts
  let worktreePath = opts.worktreePath

  const messageId = uuid()
  const now = new Date().toISOString()

  // Check if this is a continuation — only fetch one row to avoid loading full history
  const firstMsg = db.select({ id: messagesTable.id }).from(messagesTable)
    .where(eq(messagesTable.agentId, agentId))
    .limit(1)
    .get()
  const isContinuation = firstMsg != null
  let existingSessionId: string | null = db.select({ sessionId: agentsTable.sessionId })
    .from(agentsTable).where(eq(agentsTable.id, agentId)).get()?.sessionId ?? null

  await persistUserMessage(userContent, opts, now)

  // Mark agent as in-progress unless already in-review (don't downgrade)
  const currentAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  const preRunStatus = currentAgent?.status ?? "in-progress"
  const newStatus = preRunStatus === "in-review" ? "in-review" : "in-progress"
  await db.update(agentsTable)
    .set({ status: newStatus, updatedAt: now })
    .where(eq(agentsTable.id, agentId))

  const agentRow = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  const repoRow = agentRow?.repoId
    ? db.select().from(reposTable).where(eq(reposTable.id, agentRow.repoId)).get() ?? null
    : null
  if (agentRow) agentsWs.agentUpdatedTo(agentId, agentRow as unknown as AgentSummary)

  // Insert skeleton assistant message immediately so it survives page reloads
  const skeletonCreatedAt = new Date().toISOString()
  await db.insert(messagesTable).values({
    id: messageId,
    agentId,
    role: "assistant",
    content: "",
    timestamp: skeletonCreatedAt,
    createdAt: skeletonCreatedAt,
  })

  // Clear stale session ID when switching to a provider that doesn't support resume
  if (!provider.capabilities.sessionResume && existingSessionId) {
    db.update(agentsTable).set({ sessionId: null }).where(eq(agentsTable.id, agentId)).run()
  }

  // Mark agent as streaming so all connected clients know immediately
  await db.update(agentsTable).set({ streaming: 1 }).where(eq(agentsTable.id, agentId))
  const streamingAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (streamingAgent) agentsWs.agentUpdated(streamingAgent as unknown as AgentSummary)

  agentsWs.messageStart(agentId, messageId)

  worktreePath = await preSpawnAutoRename(agentId, worktreePath, agentRow, repoRow)
  const resolved = await resolveCwdAndSession({ agentId, worktreePath, isContinuation, existingSessionId, provider })
  const cwd = resolved.cwd
  const useContinue = resolved.useContinue
  existingSessionId = resolved.existingSessionId
  const branchFrom = agentRow?.baseBranch ?? repoRow?.branchFrom ?? "HEAD"

  // Re-read after the pre-rename pass so the system prompt and downstream
  // code see the agent's actual current title/branch/location.
  const liveAgentRow = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get() ?? agentRow

  return {
    messageId,
    skeletonCreatedAt,
    isContinuation,
    existingSessionId,
    useContinue,
    cwd,
    worktreePath,
    branchFrom,
    agentRow,
    repoRow,
    liveAgentRow,
    preRunStatus,
  }
}

async function persistUserMessage(userContent: string, opts: RunnerOptions, now: string): Promise<void> {
  // Persist user message — strip internal metadata (linked workspaces, attached files, etc.)
  // so the chat displays cleanly. The full content is still passed to Claude.
  const displayContent = userContent
    .replace(/\n\n---\n\nLinked workspaces[\s\S]*$/, "")
    .replace(/^Attached files:\n[\s\S]*?\n\n---\n\n/, "")
    .replace(/\n\n---\n\nLinked agents[\s\S]*$/, "")
    .trim()
  const userMsgId = uuid()
  // Sender can be explicitly provided (answer-back) or derived from delegateFrom (outbound delegate)
  const senderName = opts.sender
    ?? (opts.delegateFrom ? db.select().from(agentsTable).where(eq(agentsTable.id, opts.delegateFrom)).get()?.title : undefined)
    ?? undefined
  await db.insert(messagesTable).values({
    id: userMsgId,
    agentId: opts.agentId,
    role: "user",
    content: displayContent || userContent,
    timestamp: now,
    createdAt: now,
    ...(senderName ? { sender: senderName } : {}),
  })
  agentsWs.messageUser(opts.agentId, { id: userMsgId, role: "user" as const, content: displayContent || userContent, timestamp: now, ...(senderName ? { sender: senderName } : {}) })
}

interface ResolveCwdArgs {
  agentId: string
  worktreePath: string
  isContinuation: boolean
  existingSessionId: string | null
  provider: ProviderAdapter
}

async function resolveCwdAndSession(args: ResolveCwdArgs): Promise<{
  cwd: string
  useContinue: boolean
  existingSessionId: string | null
}> {
  const { agentId, worktreePath, isContinuation, provider } = args
  let existingSessionId = args.existingSessionId
  // Ensure cwd exists — fall back to process.cwd() if worktree hasn't been created yet
  let cwd = worktreePath
  try {
    await fs.access(cwd)
  } catch {
    cwd = process.cwd()
  }

  // B4: Check if Claude session file exists before using --continue.
  let useContinue = isContinuation
  if (useContinue) {
    try {
      await fs.access(`${cwd}/.claude/settings.json`)
    } catch {
      useContinue = false
    }
  }

  // If --resume would point at a session file that no longer exists for THIS
  // cwd (e.g. worktree moved and the projects/ dir didn't follow), clearing
  // existingSessionId now lets the runner rebuild context from DB messages
  // instead of failing with "No conversation found with session ID".
  if (existingSessionId && provider.capabilities.sessionResume) {
    const sessionFile = path.join(os.homedir(), ".claude", "projects", cwd.replace(/[./]/g, "-"), `${existingSessionId}.jsonl`)
    try {
      await fs.access(sessionFile)
    } catch {
      console.warn(`[runner] session file missing for ${agentId} at ${sessionFile} — falling back to conversation context`)
      existingSessionId = null
      db.update(agentsTable).set({ sessionId: null }).where(eq(agentsTable.id, agentId)).run()
    }
  }

  return { cwd, useContinue, existingSessionId }
}

async function preSpawnAutoRename(
  agentId: string,
  worktreePath: string,
  agentRow: typeof agentsTable.$inferSelect | undefined,
  repoRow: typeof reposTable.$inferSelect | null,
): Promise<string> {
  // Pre-spawn auto-rename: if the agent still carries the random-bee placeholder
  // and this is its first turn, derive a real title+branch+worktree BEFORE the
  // model runs. Otherwise the model may push or create a PR under the placeholder
  // name, leaving an orphaned remote ref that can't be easily renamed later.
  // Bounded by a short timeout so a stuck Haiku call never blocks the run forever.
  const liveAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!liveAgent || liveAgent.parentAgentId || !isPlaceholderName(liveAgent.title)) {
    return worktreePath
  }
  // Count user messages only — assistant skeletons can linger across crashes
  // and would otherwise make a real first turn look like a continuation.
  const userMsgCount = db.select({ id: messagesTable.id }).from(messagesTable)
    .where(and(eq(messagesTable.agentId, agentId), eq(messagesTable.role, "user")))
    .all()
    .length
  if (userMsgCount !== 1) return worktreePath
  try {
    await Promise.race([
      tryAutoRename(agentId, agentRow?.baseBranch ?? repoRow?.branchFrom ?? "HEAD"),
      new Promise<void>((res) => setTimeout(res, 15_000)),
    ])
    // Re-read the agent so the cwd/branch update below uses the new location.
    const refreshed = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    if (refreshed && repoRow && !refreshed.noWorktree) {
      return refreshed.noWorktree ? repoRow.path : path.join(repoRow.workspacesPath, refreshed.location)
    }
  } catch (err) {
    console.error(`[pre-rename] failed for ${agentId}:`, err)
  }
  return worktreePath
}
