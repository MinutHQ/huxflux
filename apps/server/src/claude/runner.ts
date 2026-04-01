import { spawn, execFileSync } from "node:child_process"
import { buildSandboxedCommand } from "../sandbox.js"
import * as fs from "node:fs/promises"
import { v4 as uuid } from "uuid"
import { db } from "../db/index.js"
import { messages as messagesTable, toolCalls as toolCallsTable, agents as agentsTable, repos as reposTable, fileChanges as fileChangesTable, terminalLines as terminalLinesTable } from "../db/schema.js"
import { emit } from "../ws/handler.js"
import { getFileChanges } from "../git/worktrees.js"
import { eq } from "drizzle-orm"
import { config } from "../config.js"
import type { Message, ToolCall } from "../types.js"

// Represents a streaming JSON line from `claude --output-format stream-json`
// Using Record<string, unknown> as base to accommodate sub-agent events we haven't typed yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClaudeStreamEvent = Record<string, any>

interface RunnerOptions {
  agentId: string
  worktreePath: string
  model?: string
}

// Registry of running agent processes
const runningProcesses = new Map<string, ReturnType<typeof spawn>>()

export function stopAgent(agentId: string): boolean {
  const proc = runningProcesses.get(agentId)
  if (!proc) return false
  proc.kill("SIGTERM")
  return true
}

export function isAgentRunning(agentId: string): boolean {
  return runningProcesses.has(agentId)
}

const MODEL_ALIASES: Record<string, string> = {
  "Opus 4.6": "claude-opus-4-6",
  "Sonnet 4.6": "claude-sonnet-4-6",
  "Haiku 4.5": "claude-haiku-4-5",
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
  fullContent: string
  fullThinking: string
  collectedToolCalls: Array<{ id: string; tool: string; args?: string; result?: string }>
  toolCallOrderIdx: number
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
}

function handleStreamEvent(
  event: ClaudeStreamEvent,
  state: StreamState,
  agentId: string,
  messageId: string,
  scheduleFlush: () => void,
): void {
  if (event.type === "assistant") {
    for (const block of event.message.content) {
      if (block.type === "text") {
        state.fullContent += block.text
        emit(agentId, { type: "message:chunk", agentId, messageId, delta: block.text })
        scheduleFlush()
      } else if (block.type === "thinking") {
        state.fullThinking += block.thinking
        emit(agentId, { type: "message:thinking", agentId, messageId, delta: block.thinking })
        scheduleFlush()
      } else if (block.type === "tool_use") {
        const tc: ToolCall = {
          id: block.id,
          tool: block.name,
          args: JSON.stringify(block.input),
        }
        state.collectedToolCalls.push({ id: block.id, tool: block.name, args: JSON.stringify(block.input) })
        state.toolCallOrderIdx++
        // Persist tool call to DB immediately so it survives reloads
        db.insert(toolCallsTable).values({
          id: block.id,
          messageId,
          tool: block.name,
          args: JSON.stringify(block.input),
          orderIdx: state.toolCallOrderIdx - 1,
        }).run()
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

// ── Message persistence ─────────────────────────────────────────────────────

async function persistAssistantMessage(
  state: StreamState,
  agentId: string,
  messageId: string,
  skeletonCreatedAt: string,
  startedAt: number,
  model: string,
  worktreePath: string,
  branchFrom: string,
  flushTimer: { current: ReturnType<typeof setTimeout> | null },
): Promise<void> {
  // Cancel any pending flush — we're about to write the final state
  if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null }

  await db.update(messagesTable)
    .set({
      content: state.fullContent,
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
    await db.update(toolCallsTable)
      .set({ result: tc.result })
      .where(eq(toolCallsTable.id, tc.id))
  }

  const builtMessage: Message = {
    id: messageId,
    role: "assistant",
    content: state.fullContent,
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
    })),
  }

  // Emit message:done immediately after the message is persisted with durationMs
  // set — this clears the client loading state regardless of what happens next.
  emit(agentId, { type: "message:done", agentId, messageId, message: builtMessage })

  // Refresh file changes after emitting so the client query cache is warm
  // by the time it re-fetches. Failures here don't affect the done signal.
  await refreshFileChanges(agentId, worktreePath, branchFrom)
}

// ── Main runner ─────────────────────────────────────────────────────────────

export async function runClaude(userContent: string, opts: RunnerOptions): Promise<void> {
  const { agentId, worktreePath } = opts
  const model = MODEL_ALIASES[opts.model ?? ""] ?? opts.model ?? "claude-sonnet-4-6"

  // B1: Reject if a process is already running for this agent
  if (runningProcesses.has(agentId)) {
    throw new Error(`Agent ${agentId} already has a running process`)
  }

  const messageId = uuid()
  const now = new Date().toISOString()

  // Check if this is a continuation (agent already has a Claude session ID)
  const existingMessages = db.select().from(messagesTable)
    .where(eq(messagesTable.agentId, agentId))
    .all()
  const isContinuation = existingMessages.length > 0
  const existingSessionId = db.select({ sessionId: agentsTable.sessionId })
    .from(agentsTable).where(eq(agentsTable.id, agentId)).get()?.sessionId ?? null


  // Persist user message
  const userMsgId = uuid()
  await db.insert(messagesTable).values({
    id: userMsgId,
    agentId,
    role: "user",
    content: userContent,
    timestamp: now,
    createdAt: now,
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
    fullContent: "",
    fullThinking: "",
    collectedToolCalls: [],
    toolCallOrderIdx: 0,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
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

  emit(agentId, { type: "message:start", agentId, messageId })

  // Resolve claude binary — prefer explicit CLAUDE_BIN env, then which, then plain name
  const claudeBin = (() => {
    if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN
    try {
      return execFileSync("which", ["claude"], { encoding: "utf8" }).trim()
    } catch {
      return "claude"
    }
  })()

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

  const branchFrom = repoRow?.branchFrom ?? "HEAD"

  return new Promise((resolve, reject) => {
    // System prompt injected on every turn so Claude always knows its identity
    // and can rename itself via the REST API.
    const agentTitle = agentRow?.title ?? agentId
    const apiBase = `http://localhost:${config.port}`
    const systemPrompt = [
      `You are a Huxflux agent. Your agent ID is "${agentId}" and your current title is "${agentTitle}".`,
      ``,
      `You can rename yourself at any time using Bash:`,
      `  curl -s -X PATCH ${apiBase}/api/agents/${agentId} -H "Content-Type: application/json" -d '{"title":"<new title>"}'`,
      ``,
      `Rename guidelines:`,
      `- Rename yourself as soon as you understand what you are working on.`,
      `- Use a short, specific title (max ~50 chars) that describes the actual task, not generic descriptions.`,
      `- Update the title again if the focus of the work changes significantly.`,
      `- Good examples: "Add CSV import to devices table", "Fix login redirect bug", "Refactor auth middleware"`,
      `- Do not include the repo name or branch — just the task.`,
    ].join("\n")

    // Launch claude CLI: --print for non-interactive, --output-format stream-json for streaming JSON
    // Use --continue for follow-up messages so Claude reuses the existing session context
    const claudeArgs = [
      "--print",
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--model", model,
      "--append-system-prompt", systemPrompt,
      ...(existingSessionId ? ["--resume", existingSessionId] : useContinue ? ["--continue"] : []),
      userContent,
    ]
    const { bin, args } = config.sandbox
      ? buildSandboxedCommand({
          claudeBin,
          claudeArgs,
          worktreePath: cwd,
          repoPath: repoRow?.path ?? null,
          cfg: config.sandbox,
        })
      : { bin: claudeBin, args: claudeArgs }

    const proc = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Ensure common install locations are in PATH on both macOS and Linux
        PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME ?? ""}/.npm-global/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}`,
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
        db.update(messagesTable)
          .set({ content: state.fullContent, thinking: state.fullThinking || null })
          .where(eq(messagesTable.id, messageId))
          .run()
      }, 500)
    }

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          handleStreamEvent(parsed, state, agentId, messageId, scheduleFlush)
        } catch {
          // Non-JSON line — could be a warning, skip it
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

    proc.on("close", async (code) => {
      runningProcesses.delete(agentId)
      // Flush any remaining buffered data (last line may lack trailing newline)
      if (buffer.trim()) {
        try { handleStreamEvent(JSON.parse(buffer.trim()), state, agentId, messageId, scheduleFlush) } catch { /* non-JSON remainder */ }
        buffer = ""
      }
      try {
        // B3: persistAssistantMessage already calls refreshFileChanges — don't call it again
        await persistAssistantMessage(state, agentId, messageId, skeletonCreatedAt, startedAt, model, worktreePath, branchFrom, flushTimer)
        const doneAt = new Date().toISOString()
        // B2: Restore the pre-run status instead of forcing "in-progress".
        // This preserves "in-review" if it was set before the run.
        await db.update(agentsTable)
          .set({ status: preRunStatus === "in-review" ? "in-review" : "in-progress", updatedAt: doneAt })
          .where(eq(agentsTable.id, agentId))
        // Broadcast updated agent so all clients (sidebar, etc.) stay in sync
        const finalAgent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
        if (finalAgent) emit(agentId, { type: "agent:updated", agent: finalAgent as any })
        resolve()
      } catch (err) {
        reject(err)
      }
    })

    proc.on("error", (err) => {
      runningProcesses.delete(agentId)
      emit(agentId, { type: "error", agentId, message: `Failed to spawn claude: ${err.message}` })
      reject(err)
    })
  })
}
