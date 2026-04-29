import { spawn, execFileSync } from "node:child_process"
import { buildSandboxedCommand } from "../sandbox.js"
import * as fs from "node:fs/promises"
import { v4 as uuid } from "uuid"
import { db } from "../db/index.js"
import { messages as messagesTable, toolCalls as toolCallsTable, agents as agentsTable, repos as reposTable, fileChanges as fileChangesTable, terminalLines as terminalLinesTable, tasks as tasksTable, taskComments as taskCommentsTable, taskAgents as taskAgentsTable, taskDependencies as taskDepsTable } from "../db/schema.js"
import { emit, broadcast } from "../ws/handler.js"
import { getFileChanges } from "../git/worktrees.js"
import { eq, sql } from "drizzle-orm"
import { config } from "../config.js"
import type { Message, ToolCall } from "../types.js"
import { getProvider } from "../providers/index.js"
import { buildConversationContext } from "../providers/context.js"
import type { NormalizedStreamEvent } from "../providers/types.js"

interface RunnerOptions {
  agentId: string
  worktreePath: string
  model?: string
  planMode?: boolean
  delegateFrom?: string  // parent agent ID when this run was delegated
  sender?: string        // display name for the sender (for delegated messages)
  provider?: string      // provider ID (defaults to agent's provider or "claude")
  effort?: string        // effort level (e.g. "low", "medium", "high", "max")
  taskContext?: string   // appended to system prompt for task-aware agents (refinement)
}

// Registry of running agent processes
const runningProcesses = new Map<string, ReturnType<typeof spawn>>()

// Legacy: resolve claude binary for backward compat (used by PR review/chat, title gen)
let _claudeBin: string | null = null
export function getClaudeBin(): string {
  if (_claudeBin) return _claudeBin
  if (process.env.CLAUDE_BIN) { _claudeBin = process.env.CLAUDE_BIN; return _claudeBin }
  try { _claudeBin = execFileSync("which", ["claude"], { encoding: "utf8" }).trim() }
  catch { _claudeBin = "claude" }
  return _claudeBin
}

export function stopAgent(agentId: string): boolean {
  const proc = runningProcesses.get(agentId)
  if (!proc) return false
  proc.kill("SIGTERM")
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

// ── File change persistence ─────────────────────────────────────────────────

async function refreshFileChanges(
  agentId: string,
  worktreePath: string,
  branchFrom: string,
): Promise<void> {
  try {
    const files = await getFileChanges(worktreePath, branchFrom)

    // Persist to DB so the file list survives page reloads
    await db.delete(fileChangesTable).where(eq(fileChangesTable.agentId, agentId))
    for (const f of files) {
      await db.insert(fileChangesTable).values({
        id: `${agentId}-${f.path.replace(/[/\\]/g, "-")}`,
        agentId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
      })
    }

    emit(agentId, { type: "file:changed", agentId, files })
  } catch { /* not fatal */ }
}

// ── Stream event handler ────────────────────────────────────────────────────

interface StreamState {
  // Text emitted since the last tool call (or message start). On every
  // tool_use it gets attached to that tool call's `precedingText` and reset.
  // Whatever's left at message end becomes the message's final `content`.
  pendingText: string
  // All text across the entire message (never reset). Used by plan mode
  // to surface the full plan as msg.content regardless of tool calls.
  fullContent: string
  fullThinking: string
  collectedToolCalls: Array<{ id: string; tool: string; args?: string; result?: string; precedingText?: string }>
  toolCallOrderIdx: number
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  firedDelegates: Set<string> // track delegate tags already fired during streaming
  firedTitle?: boolean
  firedBranch?: boolean
}

function checkMetaDirectives(state: StreamState, agentId: string): void {
  // huxflux:title — agent sets its own title
  const titleMatch = state.fullContent.match(/<huxflux:title>(.*?)<\/huxflux:title>/)
  if (titleMatch && !state.firedTitle) {
    state.firedTitle = true
    const title = titleMatch[1].trim().slice(0, 60)
    if (title) {
      db.update(agentsTable).set({ title, updatedAt: new Date().toISOString() }).where(eq(agentsTable.id, agentId)).run()
      const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (updated) broadcast({ type: "agent:updated", agent: updated as any })
    }
  }

  // huxflux:branch — agent renames its branch (prefix is prepended automatically)
  const branchMatch = state.fullContent.match(/<huxflux:branch>(.*?)<\/huxflux:branch>/)
  if (branchMatch && !state.firedBranch) {
    state.firedBranch = true
    const rawName = branchMatch[1].trim().toLowerCase().replace(/[^a-z0-9/._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
    if (rawName) {
      const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (agent?.repoId) {
        const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
        if (repo) {
          const prefix = repo.branchPrefix ? `${repo.branchPrefix}/` : ""
          const newBranch = rawName.startsWith(prefix) ? rawName : `${prefix}${rawName}`
          const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
          import("simple-git").then(({ simpleGit }) => {
            const git = simpleGit(worktreePath)
            git.revparse(["--abbrev-ref", "HEAD"]).then((current) => {
              const currentBranch = current.trim()
              if (currentBranch !== newBranch) {
                git.raw(["branch", "-m", currentBranch, newBranch]).then(() => {
                  db.update(agentsTable).set({ branch: newBranch, updatedAt: new Date().toISOString() }).where(eq(agentsTable.id, agentId)).run()
                  const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
                  if (updated) broadcast({ type: "agent:updated", agent: updated as any })
                }).catch(() => {})
              }
            }).catch(() => {})
          }).catch(() => {})
        }
      }
    }
  }
}

function checkAndFireDelegates(state: StreamState, agentId: string): void {
  const delegateRe = /<huxflux:delegate agent="([^"]+)">([\s\S]*?)<\/huxflux:delegate>/g
  let match: RegExpExecArray | null
  while ((match = delegateRe.exec(state.fullContent)) !== null) {
    const targetAgentId = match[1].trim()
    const task = match[2].trim()
    const key = `${targetAgentId}:${task.slice(0, 50)}`
    if (!targetAgentId || !task || state.firedDelegates.has(key)) continue
    state.firedDelegates.add(key)
    const sourceTitle = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()?.title ?? "Another agent"
    const body = JSON.stringify({ content: task, sender: sourceTitle, delegateFrom: agentId })
    console.log(`[delegate] streaming: firing delegate from ${agentId} to ${targetAgentId}`)
    fetch(`http://localhost:${config.boundPort}/api/agents/${targetAgentId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}) },
      body,
    }).catch((err) => console.error(`[delegate] Failed to send to ${targetAgentId}:`, err))
  }
}

function handleStreamEvent(
  event: ClaudeStreamEvent,
  state: StreamState,
  agentId: string,
  messageId: string,
  scheduleFlush: () => void,
): void {
  // Sub-agent events carry parent_tool_use_id — route them before any type checks
  // so they don't get processed as parent content/tool-calls.
  if ("parent_tool_use_id" in event && event.parent_tool_use_id) {
    const toolUseId = event.parent_tool_use_id as string
    emit(agentId, { type: "subagent:event", agentId, toolUseId, event: event as Record<string, unknown> })
    emit(agentId, { type: "terminal:line", agentId, line: `[stream] ${JSON.stringify(event)}` })
    return
  }

  if (event.type === "assistant") {
    for (const block of event.message.content) {
      if (block.type === "text") {
        // Stream the chunk to the client right away (it appends to msg.content
        // optimistically). If a tool_use follows, the client will move this
        // text out of msg.content into the tool call's precedingText.
        state.pendingText += block.text
        state.fullContent += block.text
        emit(agentId, { type: "message:chunk", agentId, messageId, delta: block.text })
        scheduleFlush()
      } else if (block.type === "thinking") {
        state.fullThinking += block.thinking
        emit(agentId, { type: "message:thinking", agentId, messageId, delta: block.thinking })
        scheduleFlush()
      } else if (block.type === "tool_use") {
        const precedingText = state.pendingText || undefined
        state.pendingText = ""
        const tc: ToolCall = {
          id: block.id,
          tool: block.name,
          args: JSON.stringify(block.input),
          precedingText,
        }
        state.collectedToolCalls.push({
          id: block.id,
          tool: block.name,
          args: JSON.stringify(block.input),
          precedingText,
        })
        state.toolCallOrderIdx++
        // Persist tool call to DB immediately so it survives reloads
        try {
          db.insert(toolCallsTable).values({
            id: block.id,
            messageId,
            tool: block.name,
            args: JSON.stringify(block.input),
            orderIdx: state.toolCallOrderIdx - 1,
            precedingText,
          }).run()
        } catch { /* duplicate ID from provider replaying events */ }
        emit(agentId, { type: "tool:call", agentId, messageId, toolCall: tc })
      }
    }
  } else if (event.type === "tool_result") {
    const tc = state.collectedToolCalls.find((t) => t.id === event.tool_use_id)
    if (tc) tc.result = event.content
    // Persist tool result to DB immediately
    db.update(toolCallsTable)
      .set({ result: event.content })
      .where(eq(toolCallsTable.id, event.tool_use_id))
      .run()
    emit(agentId, {
      type: "tool:result",
      agentId,
      messageId,
      toolCallId: event.tool_use_id,
      result: event.content,
    })
  } else if (event.type === "result" && event.usage) {
    state.inputTokens = event.usage.input_tokens ?? null
    state.outputTokens = event.usage.output_tokens ?? null
    state.cacheReadTokens = event.usage.cache_read_input_tokens ?? null
    state.cacheWriteTokens = event.usage.cache_creation_input_tokens ?? null
  } else if (event.type === "system" && event.subtype === "init" && event.session_id) {
    db.update(agentsTable)
      .set({ sessionId: event.session_id })
      .where(eq(agentsTable.id, agentId))
      .run()
  } else if (event.type !== "system") {
    // Forward unrecognized events (likely sub-agent activity) to frontend.
    const toolUseId = event.parent_tool_use_id ?? event.tool_use_id ?? ""
    emit(agentId, {
      type: "subagent:event",
      agentId,
      toolUseId,
      event: event as Record<string, unknown>,
    })
    emit(agentId, {
      type: "terminal:line",
      agentId,
      line: `[stream] ${JSON.stringify(event)}`,
    })
  }
}

/** Handle a provider-agnostic normalized stream event */
function handleNormalizedEvent(
  event: NormalizedStreamEvent,
  state: StreamState,
  agentId: string,
  messageId: string,
  scheduleFlush: () => void,
): void {
  switch (event.type) {
    case "text":
      state.pendingText += event.text
      state.fullContent += event.text
      emit(agentId, { type: "message:chunk", agentId, messageId, delta: event.text })
      // Fire delegate tags as soon as they're complete (don't wait for response end)
      checkAndFireDelegates(state, agentId)
      checkMetaDirectives(state, agentId)
      scheduleFlush()
      break
    case "thinking":
      state.fullThinking += event.text
      emit(agentId, { type: "message:thinking", agentId, messageId, delta: event.text })
      scheduleFlush()
      break
    case "tool_use": {
      const precedingText = state.pendingText || undefined
      state.pendingText = ""
      const tc: ToolCall = { id: event.id, tool: event.name, args: JSON.stringify(event.input), precedingText }
      state.collectedToolCalls.push({ id: event.id, tool: event.name, args: JSON.stringify(event.input), precedingText })
      state.toolCallOrderIdx++
      try {
        db.insert(toolCallsTable).values({
          id: event.id, messageId, tool: event.name,
          args: JSON.stringify(event.input), orderIdx: state.toolCallOrderIdx - 1, precedingText,
        }).run()
      } catch { /* duplicate ID from provider replaying events */ }
      emit(agentId, { type: "tool:call", agentId, messageId, toolCall: tc })
      break
    }
    case "tool_result": {
      const tc = state.collectedToolCalls.find((t) => t.id === event.toolUseId)
      if (tc) tc.result = event.content
      if (event.toolUseId) {
        db.update(toolCallsTable).set({ result: event.content }).where(eq(toolCallsTable.id, event.toolUseId)).run()
      }
      emit(agentId, { type: "tool:result", agentId, messageId, toolCallId: event.toolUseId, result: event.content })
      break
    }
    case "usage":
      state.inputTokens = event.inputTokens ?? null
      state.outputTokens = event.outputTokens ?? null
      state.cacheReadTokens = event.cacheReadTokens ?? null
      state.cacheWriteTokens = event.cacheWriteTokens ?? null
      break
    case "session_init":
      db.update(agentsTable).set({ sessionId: event.sessionId }).where(eq(agentsTable.id, agentId)).run()
      break
    case "subagent":
      emit(agentId, { type: "subagent:event", agentId, toolUseId: event.toolUseId, event: event.event })
      break
    case "error":
      // Surface errors as message content so the user sees them
      state.pendingText += `\n\nError: ${event.message}`
      state.fullContent += `\n\nError: ${event.message}`
      emit(agentId, { type: "message:chunk", agentId, messageId, delta: `\n\nError: ${event.message}` })
      emit(agentId, { type: "error", agentId, message: event.message })
      break
  }
}

// ── Message persistence ─────────────────────────────────────────────────────

async function persistAssistantMessage(
  state: StreamState,
  agentId: string,
  messageId: string,
  skeletonCreatedAt: string,
  startedAt: number,
  model: string,
  providerId: string,
  worktreePath: string,
  branchFrom: string,
  flushTimer: { current: ReturnType<typeof setTimeout> | null },
): Promise<void> {
  // Cancel any pending flush — we're about to write the final state
  if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null }

  // For Claude: only text after the last tool call becomes content (pendingText).
  // For other providers: use fullContent since they don't split text into precedingText.
  // If ExitPlanMode exists, use its precedingText as the plan content.
  let finalContent = providerId === "claude" ? state.pendingText : (state.fullContent || state.pendingText)
  const exitCall = state.collectedToolCalls.find((tc) => tc.tool === "ExitPlanMode")
  if (exitCall?.precedingText?.trim()) {
    finalContent = exitCall.precedingText.trim()
  }

  // Parse and strip any <huxflux:branch> tags emitted by Claude
  const branchTagRe = /<huxflux:branch>(.*?)<\/huxflux:branch>/gs
  let branchTagMatch: RegExpExecArray | null
  let rawBranchName: string | null = null
  while ((branchTagMatch = branchTagRe.exec(state.fullContent)) !== null) {
    rawBranchName = branchTagMatch[1].trim()
  }
  if (rawBranchName) {
    state.fullContent = state.fullContent.replace(/<huxflux:branch>.*?<\/huxflux:branch>\n?/gs, "").trim()
    // Prepend repo branch prefix if configured
    const agentForBranch = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    let finalBranch = rawBranchName
    if (agentForBranch?.repoId) {
      const repoForBranch = db.select().from(reposTable).where(eq(reposTable.id, agentForBranch.repoId)).get()
      if (repoForBranch?.branchPrefix) {
        const prefix = `${repoForBranch.branchPrefix}/`
        if (!finalBranch.startsWith(prefix)) finalBranch = `${prefix}${finalBranch}`
      }
    }
    db.update(agentsTable)
      .set({ branch: finalBranch, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId))
      .run()
    const updatedAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    if (updatedAgent) broadcast({ type: "agent:updated", agent: updatedAgent as any })
  }

  // Parse and strip any <huxflux:title> tags
  const titleTagRe = /<huxflux:title>(.*?)<\/huxflux:title>/gs
  let titleMatch: RegExpExecArray | null
  let newTitle: string | null = null
  while ((titleMatch = titleTagRe.exec(state.fullContent)) !== null) {
    newTitle = titleMatch[1].trim()
  }
  if (newTitle) {
    finalContent = finalContent.replace(/<huxflux:title>.*?<\/huxflux:title>\n?/gs, "").trim()
    state.fullContent = state.fullContent.replace(/<huxflux:title>.*?<\/huxflux:title>\n?/gs, "").trim()
    db.update(agentsTable)
      .set({ title: newTitle, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId))
      .run()
    const updatedAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    if (updatedAgent) broadcast({ type: "agent:updated", agent: updatedAgent as any })
  }

  // Fire any delegate tags that weren't caught during streaming (e.g. emitted at the very end).
  // Tags already fired during streaming are tracked in state.firedDelegates and skipped.
  const delegateRe = /<huxflux:delegate agent="([^"]+)">([\s\S]*?)<\/huxflux:delegate>/g
  let delegateMatch: RegExpExecArray | null
  const sourceTitle = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()?.title ?? "Another agent"
  while ((delegateMatch = delegateRe.exec(state.fullContent)) !== null) {
    const targetAgentId = delegateMatch[1].trim()
    const task = delegateMatch[2].trim()
    const key = `${targetAgentId}:${task.slice(0, 50)}`
    if (targetAgentId && task && !state.firedDelegates.has(key)) {
      state.firedDelegates.add(key)
      const body = JSON.stringify({ content: task, sender: sourceTitle, delegateFrom: agentId })
      console.log(`[delegate] persist: firing delegate from ${agentId} to ${targetAgentId}`)
      fetch(`http://localhost:${config.boundPort}/api/agents/${targetAgentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}) },
        body,
      }).catch((err) => console.error(`[delegate] Failed to send to ${targetAgentId}:`, err))
    }
  }
  // Strip delegate tags from displayed content
  const hadDelegates = /<huxflux:delegate/.test(finalContent)
  finalContent = finalContent.replace(/<huxflux:delegate agent="[^"]*">[\s\S]*?<\/huxflux:delegate>\n?/g, "").trim()
  if (hadDelegates && !finalContent) {
    finalContent = "Delegated task to linked workspace."
  }

  // Parse and execute <huxflux:task-*> tags for task system integration
  await parseTaskTags(finalContent, agentId)
  finalContent = finalContent
    .replace(/<huxflux:task-comment[^>]*>[\s\S]*?<\/huxflux:task-comment>\n?/g, "")
    .replace(/<huxflux:task-update[^>]*>[\s\S]*?<\/huxflux:task-update>\n?/g, "")
    .replace(/<huxflux:task-create[^>]*>[\s\S]*?<\/huxflux:task-create>\n?/g, "")
    .replace(/<huxflux:task-status[^>]*\/>\n?/g, "")
    .replace(/<huxflux:task-dependency[^>]*\/>\n?/g, "")
    .trim()

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

  // Update tool call results (they're already inserted; just ensure final state)
  for (const tc of state.collectedToolCalls) {
    if (tc.result === undefined) continue
    await db.update(toolCallsTable)
      .set({ result: tc.result })
      .where(eq(toolCallsTable.id, tc.id))
  }

  const builtMessage: Message = {
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

  // Emit message:done immediately after the message is persisted with durationMs
  // set — this clears the client loading state regardless of what happens next.
  emit(agentId, { type: "message:done", agentId, messageId, message: builtMessage })

  // If this is a working agent linked to a task, auto-post its response as a task comment.
  // Skip for refine agents (noWorktree=1) — their messages table is the source of truth.
  const agentRow = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (agentRow?.taskId && finalContent && !agentRow.noWorktree) {
    const commentId = uuid()
    const now = new Date().toISOString()
    db.insert(taskCommentsTable).values({
      id: commentId,
      taskId: agentRow.taskId,
      agentId,
      author: agentRow.title,
      role: "ai",
      content: finalContent,
      createdAt: now,
    }).run()
    broadcast({ type: "task:comment", taskId: agentRow.taskId, comment: { id: commentId, author: agentRow.title, role: "ai", content: finalContent, agentId, createdAt: now } })
  }

  // Refresh file changes after emitting so the client query cache is warm
  // by the time it re-fetches. Failures here don't affect the done signal.
  await refreshFileChanges(agentId, worktreePath, branchFrom)

}

// ── Main runner ─────────────────────────────────────────────────────────────

export async function runClaude(userContent: string, opts: RunnerOptions): Promise<void> {
  const { agentId, worktreePath } = opts
  const provider = getProvider(opts.provider ?? "claude")
  const model = provider.resolveModel(opts.model ?? "")

  if (!provider.isAvailable()) {
    throw new Error(`${provider.name} CLI is not installed. Install it to use this provider.`)
  }

  // B1: Reject if a process is already running for this agent
  if (runningProcesses.has(agentId)) {
    throw new Error(`Agent ${agentId} already has a running process`)
  }

  const messageId = uuid()
  const now = new Date().toISOString()

  // Check if this is a continuation — only fetch one row to avoid loading full history
  const firstMsg = db.select({ id: messagesTable.id }).from(messagesTable)
    .where(eq(messagesTable.agentId, agentId))
    .limit(1)
    .get()
  const isContinuation = firstMsg != null
  const existingSessionId = db.select({ sessionId: agentsTable.sessionId })
    .from(agentsTable).where(eq(agentsTable.id, agentId)).get()?.sessionId ?? null


  // Persist user message — strip internal metadata (linked workspaces, attached files, etc.)
  // so the chat displays cleanly. The full content is still passed to Claude.
  const displayContent = userContent.replace(/\n\n---\n\nLinked workspaces[\s\S]*$/, "").replace(/^Attached files:\n[\s\S]*?\n\n---\n\n/, "").replace(/\n\n---\n\nLinked agents[\s\S]*$/, "").trim()
  const userMsgId = uuid()
  // Sender can be explicitly provided (answer-back) or derived from delegateFrom (outbound delegate)
  const senderName = opts.sender
    ?? (opts.delegateFrom ? db.select().from(agentsTable).where(eq(agentsTable.id, opts.delegateFrom)).get()?.title : undefined)
    ?? undefined
  await db.insert(messagesTable).values({
    id: userMsgId,
    agentId,
    role: "user",
    content: displayContent || userContent,
    timestamp: now,
    createdAt: now,
    ...(senderName ? { sender: senderName } : {}),
  })
  emit(agentId, {
    type: "message:user",
    agentId,
    message: { id: userMsgId, role: "user" as const, content: displayContent || userContent, timestamp: now, ...(senderName ? { sender: senderName } : {}) },
  })

  // Mark agent as in-progress unless already in-review (don't downgrade)
  const currentAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  const preRunStatus = currentAgent?.status ?? "in-progress"
  const newStatus = preRunStatus === "in-review" ? "in-review" : "in-progress"
  await db.update(agentsTable)
    .set({ status: newStatus, updatedAt: now })
    .where(eq(agentsTable.id, agentId))

  const agentRow = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  const repoRow = agentRow?.repoId
    ? db.select().from(reposTable).where(eq(reposTable.id, agentRow.repoId)).get()
    : null
  if (agentRow) emit(agentId, { type: "agent:updated", agent: agentRow as any })

  // Stream state — mutable accumulator for the assistant response
  const state: StreamState = {
    pendingText: "",
    fullContent: "",
    fullThinking: "",
    collectedToolCalls: [],
    toolCallOrderIdx: 0,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    firedDelegates: new Set(),
  }
  const startedAt = Date.now()

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
  if (streamingAgent) broadcast({ type: "agent:updated", agent: streamingAgent as any })

  emit(agentId, { type: "message:start", agentId, messageId })

  const claudeBin = getClaudeBin()

  // Ensure cwd exists — fall back to process.cwd() if worktree hasn't been created yet
  let cwd = worktreePath
  try {
    await fs.access(cwd)
  } catch {
    cwd = process.cwd()
  }

  // B4: Check if Claude session file exists before using --continue.
  // If the session file was deleted (e.g. server restart), --continue would fail
  // even though the DB has messages — so fall back to a fresh session.
  let useContinue = isContinuation
  if (useContinue) {
    try {
      await fs.access(`${cwd}/.claude/settings.json`)
    } catch {
      useContinue = false
    }
  }

  const branchFrom = agentRow?.baseBranch ?? repoRow?.branchFrom ?? "HEAD"

  // Install provider-specific hooks (e.g. AskUserQuestion for Claude)
  const apiBase = `http://localhost:${config.boundPort}`
  if (provider.installHooks && provider.capabilities.askUserQuestion) {
    await provider.installHooks(agentId, cwd, apiBase, config.authToken)
  }

  return new Promise((resolve, reject) => {
    // System prompt — provider-agnostic agent identity + instructions
    const agentTitle = agentRow?.title ?? agentId
    const agentBranch = agentRow?.branch ?? ""
    const systemPrompt = opts.taskContext
      ? [
          `You are a Huxflux refinement assistant.`,
          ``,
          opts.taskContext,
        ].join("\n")
      : [
          `You are a Huxflux agent. Your agent ID is "${agentId}", your current title is "${agentTitle}", and your current git branch is "${agentBranch}".`,
          ``,
          `To rename yourself, emit this tag on its own line in your response:`,
          `  <huxflux:title>new title here</huxflux:title>`,
          ``,
          `Rename guidelines:`,
          `- Rename yourself as soon as you understand what you are working on.`,
          `- Use a short, specific title (max ~50 chars) that describes the actual task, not generic descriptions.`,
          `- Update the title again if the focus of the work changes significantly.`,
          `- Good examples: "Add CSV import to devices table", "Fix login redirect bug", "Refactor auth middleware"`,
          `- Do not include the repo name or branch — just the task.`,
          ``,
          `To rename your git branch, emit this tag on its own line:`,
          `  <huxflux:branch>new-branch-name</huxflux:branch>`,
          `The branch will be renamed automatically. Do this as soon as you understand the task, alongside the title rename.`,
          `Use kebab-case, be descriptive, max ~50 chars. Do NOT include any prefix — just the name.`,
          ...(repoRow?.branchPrefix ? [`The prefix "${repoRow.branchPrefix}/" will be added automatically. Example: emit "fix-csv-encoding" and the branch becomes "${repoRow.branchPrefix}/fix-csv-encoding".`] : [`Example: "fix-csv-import-encoding"`]),
          `Also emit this tag whenever you manually rename the branch (git branch -m) so the UI stays in sync.`,
          ``,
          `Answer format:`,
          `- Use newlines to separate thoughts, steps, and observations — not colons or semicolons.`,
          `- Start each new idea or action on its own line.`,
          ...(opts.planMode && provider.capabilities.planMode ? [
            ``,
            `You are in plan mode. You MUST describe your full plan in your response text so the user can read it in the chat.`,
            `Do NOT only write to the plan file — output the plan steps directly in your message.`,
            `After describing the plan, call ExitPlanMode.`,
          ] : []),
        ].join("\n")

    // Build conversation context when provider can't resume from session,
    // or when there's no session to resume (e.g. switched providers mid-conversation)
    const canResume = provider.capabilities.sessionResume && existingSessionId
    const conversationContext = isContinuation && !canResume
      ? buildConversationContext(agentId)
      : undefined

    // Use provider adapter to build spawn arguments
    const spawnResult = provider.buildSpawnArgs({
      prompt: userContent,
      model,
      planMode: opts.planMode ?? false,
      sessionId: canResume ? existingSessionId : null,
      isContinuation: canResume ? false : (provider.capabilities.sessionContinue ? useContinue : false),
      cwd,
      systemPrompt,
      effort: opts.effort,
      conversationContext,
    })

    // Apply sandboxing if configured (currently Claude-only)
    const { bin, args } = config.sandbox && provider.id === "claude"
      ? buildSandboxedCommand({
          claudeBin: spawnResult.bin,
          claudeArgs: spawnResult.args,
          worktreePath: cwd,
          repoPath: repoRow?.path ?? null,
          cfg: config.sandbox,
        })
      : spawnResult

    const proc = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development", // agents need devDependencies (lint, types) — don't inherit production
        PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME ?? ""}/.npm-global/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}`,
        HUXFLUX_AGENT_ID: agentId,
        HUXFLUX_WORKTREE: cwd,
        HUXFLUX_REPO: repoRow?.path ?? "",
        HUXFLUX_API_BASE: apiBase,
        HUXFLUX_AUTH: config.authToken,
        ...spawnResult.env,
      },
    })

    runningProcesses.set(agentId, proc)

    let buffer = ""

    // Flush content/thinking to DB periodically so it survives page reloads.
    // We debounce to avoid hammering SQLite on every text chunk.
    const flushTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null }
    function scheduleFlush() {
      if (flushTimer.current) return
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null
        // Only the trailing pending text becomes content here too — text
        // already moved into a tool call's precedingText is no longer in
        // pendingText, so it won't be double-counted.
        db.update(messagesTable)
          .set({ content: state.pendingText, thinking: state.fullThinking || null })
          .where(eq(messagesTable.id, messageId))
          .run()
      }, 500)
    }

    console.log(`[runner] spawned ${provider.id} (${bin}) pid=${proc.pid} args=${args.slice(0, 5).join(" ")}...`)

    proc.stdout.on("data", (chunk: Buffer) => {
      if (provider.id !== "claude") console.log(`[runner] ${provider.id} stdout: ${chunk.toString().slice(0, 120)}...`)
      buffer += chunk.toString()

      // Split buffer into individual JSON objects. Claude uses newline-delimited JSON.
      // Other providers (OpenCode) may concatenate JSON objects without newlines.
      let lines: string[]
      if (provider.id === "claude") {
        lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
      } else {
        // Split concatenated JSON: }{ → }\n{
        lines = buffer.replace(/\}\s*\{/g, "}\n{").split("\n")
        buffer = lines.pop() ?? ""
      }

      for (const line of lines) {
        if (!line.trim()) continue
        if (provider.id === "claude") {
          try {
            const parsed = JSON.parse(line)
            handleStreamEvent(parsed, state, agentId, messageId, scheduleFlush)
          } catch { /* non-JSON */ }
        } else {
          const event = provider.parseStreamLine(line)
          if (event) handleNormalizedEvent(event, state, agentId, messageId, scheduleFlush)
        }
      }
    })

    proc.stderr.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter((l) => l.trim())
      for (const line of lines) {
        const ts = new Date().toISOString()
        db.insert(terminalLinesTable).values({ id: uuid(), agentId, line, createdAt: ts }).run()
        emit(agentId, { type: "terminal:line", agentId, line })
      }
    })

    // ── Finalize ────────────────────────────────────────────────────────────
    // Called from every exit path (close success, close catch, spawn error).
    // Guarantees: runningProcesses entry removed, streaming flag cleared in DB,
    // message:done emitted (with whatever partial state we have), and an
    // agent:updated broadcast so every client can re-derive loading state.
    // Idempotent — safe to call multiple times.
    let finalized = false
    async function finalize(): Promise<void> {
      if (finalized) return
      finalized = true
      runningProcesses.delete(agentId)

      // Flush any remaining buffered data (last line may lack trailing newline)
      if (buffer.trim()) {
        const remaining = provider.id === "claude"
          ? [buffer.trim()]
          : buffer.trim().replace(/\}\s*\{/g, "}\n{").split("\n")
        for (const part of remaining) {
          if (!part.trim()) continue
          if (provider.id === "claude") {
            try { handleStreamEvent(JSON.parse(part), state, agentId, messageId, scheduleFlush) } catch { /* non-JSON */ }
          } else {
            const event = provider.parseStreamLine(part)
            if (event) handleNormalizedEvent(event, state, agentId, messageId, scheduleFlush)
          }
        }
        buffer = ""
      }

      // Persist the final message + emit message:done. Failures here must not
      // prevent the streaming flag from being cleared, so they're swallowed.
      try {
        await persistAssistantMessage(state, agentId, messageId, skeletonCreatedAt, startedAt, model, provider.id, cwd, branchFrom, flushTimer)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[runner] persistAssistantMessage failed for ${agentId}:`, err)
        // Still emit a done signal with whatever we have so the client unsticks.
        emit(agentId, {
          type: "message:done",
          agentId,
          messageId,
          message: {
            id: messageId,
            role: "assistant",
            content: state.pendingText,
            timestamp: skeletonCreatedAt,
            durationMs: Date.now() - startedAt,
            toolCalls: state.collectedToolCalls.map((tc) => ({ id: tc.id, tool: tc.tool, args: tc.args, result: tc.result, precedingText: tc.precedingText })),
          } as Message,
        })
      }

      // If this run was triggered by a delegate from another agent, send the result back
      if (opts.delegateFrom && state.fullContent.trim()) {
        const agentTitle = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()?.title ?? "Agent"
        fetch(`http://localhost:${config.boundPort}/api/agents/${opts.delegateFrom}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}) },
          body: JSON.stringify({ content: state.fullContent.trim(), sender: agentTitle }),
        }).catch((err) => console.error(`[delegate] Failed to reply to ${opts.delegateFrom}:`, err))
      }

      // Restore the pre-run status and clear streaming regardless of what
      // happened above. B2: don't downgrade "in-review".
      try {
        const doneAt = new Date().toISOString()
        await db.update(agentsTable)
          .set({
            status: preRunStatus === "in-review" ? "in-review" : "in-progress",
            streaming: 0,
            unread: sql`unread + 1`,
            updatedAt: doneAt,
          })
          .where(eq(agentsTable.id, agentId))

        const finalAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
        if (finalAgent) broadcast({ type: "agent:updated", agent: finalAgent as any })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[runner] failed to clear streaming flag for ${agentId}:`, err)
      }
    }

    proc.on("close", async (code) => {
      console.log(`[runner] ${provider.id} exited code=${code} fullContent=${state.fullContent.length}bytes pendingText=${state.pendingText.length}bytes`)
      await finalize()
      resolve()
    })

    proc.on("error", async (err) => {
      emit(agentId, { type: "error", agentId, message: `Failed to spawn claude: ${err.message}` })
      await finalize()
      reject(err)
    })
  })
}

// ── Task tag parsing ──────────────────────────────────────────────────────────

async function parseTaskTags(content: string, agentId: string) {
  // <huxflux:task-comment taskId="...">content</huxflux:task-comment>
  const commentRe = /<huxflux:task-comment\s+taskId="([^"]+)">([\s\S]*?)<\/huxflux:task-comment>/g
  for (const match of content.matchAll(commentRe)) {
    const [, taskId, commentContent] = match
    const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    const id = uuid()
    const now = new Date().toISOString()
    db.insert(taskCommentsTable).values({
      id,
      taskId,
      agentId,
      author: agent?.title ?? "Agent",
      role: "ai",
      content: commentContent.trim(),
      createdAt: now,
    }).run()
    broadcast({ type: "task:comment", taskId, comment: { id, author: agent?.title ?? "Agent", role: "ai", content: commentContent.trim(), agentId, createdAt: now } })
  }

  // <huxflux:task-update taskId="..." field="description">new content</huxflux:task-update>
  const updateRe = /<huxflux:task-update\s+taskId="([^"]+)"\s+field="([^"]+)">([\s\S]*?)<\/huxflux:task-update>/g
  for (const match of content.matchAll(updateRe)) {
    const [, taskId, field, value] = match
    if (field === "description") {
      db.update(tasksTable).set({ description: value.trim(), updatedAt: new Date().toISOString() }).where(eq(tasksTable.id, taskId)).run()
      broadcast({ type: "task:updated", taskId })
    }
  }

  // <huxflux:task-create parentId="..." repoId="...">{"title":"...", "description":"..."}</huxflux:task-create>
  const createRe = /<huxflux:task-create\s+parentId="([^"]+)"(?:\s+repoId="([^"]*)")?\s*>([\s\S]*?)<\/huxflux:task-create>/g
  for (const match of content.matchAll(createRe)) {
    const [, parentId, repoId, jsonStr] = match
    try {
      const data = JSON.parse(jsonStr.trim())
      const now = new Date().toISOString()
      db.insert(tasksTable).values({
        id: uuid(),
        parentId,
        repoId: repoId || null,
        title: data.title,
        description: data.description ?? null,
        status: "backlog",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      }).run()
      broadcast({ type: "task:updated", taskId: parentId })
    } catch { /* skip malformed JSON */ }
  }

  // <huxflux:task-status taskId="..." status="ready"/>
  const statusRe = /<huxflux:task-status\s+taskId="([^"]+)"\s+status="([^"]+)"\s*\/>/g
  for (const match of content.matchAll(statusRe)) {
    const [, taskId, status] = match
    db.update(tasksTable).set({ status, updatedAt: new Date().toISOString() }).where(eq(tasksTable.id, taskId)).run()
    broadcast({ type: "task:updated", taskId })
  }

  // <huxflux:task-dependency taskId="..." dependsOn="..."/>
  const depRe = /<huxflux:task-dependency\s+taskId="([^"]+)"\s+dependsOn="([^"]+)"\s*\/>/g
  for (const match of content.matchAll(depRe)) {
    const [, taskId, dependsOnTaskId] = match
    const existing = db.select().from(taskDepsTable).where(eq(taskDepsTable.taskId, taskId)).all()
    if (!existing.some((e: { dependsOnTaskId: string }) => e.dependsOnTaskId === dependsOnTaskId)) {
      db.insert(taskDepsTable).values({ id: uuid(), taskId, dependsOnTaskId }).run()
      broadcast({ type: "task:updated", taskId })
    }
  }
}
