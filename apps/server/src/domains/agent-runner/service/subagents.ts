// Sub-agent runs spawned by the Agent tool. The CLI tags every message a
// sub-agent produces with `parent_tool_use_id` (the Agent call that spawned
// it) and reports the run's lifecycle as `system` task events. Both are
// persisted on the tool_calls table: the sub-agent's own tool calls become
// rows whose `parent_id` points at the Agent call, and the Agent call's row
// holds the streamed text, status, summary and latest progress line. Each
// change is also pushed to clients as a `subagent:update` frame.

import { and, count, eq, inArray } from "drizzle-orm"
import { isAgentTool, type SubagentStatus, type SubagentUpdate } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { messages as messagesTable, toolCalls as toolCallsTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import { dropBackgroundTask, noteBackgroundAgent } from "./backgroundTasks.js"

interface RawBlock {
  type?: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
}

interface ParentCall {
  id: string
  messageId: string
}

// Per agent: CLI task id -> Agent tool call id, learned from `task_started`
// so `task_updated` (which only carries the task id) can be routed, and the
// Agent calls the CLI runs in the background.
interface AgentTasks {
  toolUseIds: Map<string, string>
  backgrounded: Set<string>
}
const agentTasks = new Map<string, AgentTasks>()

function tasksFor(agentId: string): AgentTasks {
  let tasks = agentTasks.get(agentId)
  if (!tasks) {
    tasks = { toolUseIds: new Map(), backgrounded: new Set() }
    agentTasks.set(agentId, tasks)
  }
  return tasks
}

/** tool_result content is either a plain string or an array of text blocks. */
export function toolResultContentToString(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
    .join("")
}

/**
 * Handle one message a sub-agent produced. Assistant messages carry its text
 * and tool calls; user messages carry the results of those tool calls.
 * Events for an unknown parent are dropped.
 */
export function handleSubagentMessage(agentId: string, parentToolUseId: string, event: Record<string, unknown>): void {
  const parent = db.select({ id: toolCallsTable.id, messageId: toolCallsTable.messageId })
    .from(toolCallsTable)
    .where(eq(toolCallsTable.id, parentToolUseId))
    .get()
  if (!parent) return
  const message = event.message as { content?: unknown } | undefined
  const blocks = Array.isArray(message?.content) ? (message.content as RawBlock[]) : []
  for (const block of blocks) {
    if (event.type === "assistant" && block.type === "text" && block.text) {
      appendOutputText(agentId, parent, block.text)
    } else if (event.type === "assistant" && block.type === "tool_use" && block.id && block.name) {
      recordSubCall(agentId, parent, { id: block.id, name: block.name, input: block.input })
    } else if (event.type === "user" && block.type === "tool_result" && block.tool_use_id) {
      recordSubCallResult(agentId, parent, block.tool_use_id, toolResultContentToString(block.content))
    }
  }
}

function appendOutputText(agentId: string, parent: ParentCall, text: string): void {
  const row = db.select({ outputText: toolCallsTable.outputText }).from(toolCallsTable).where(eq(toolCallsTable.id, parent.id)).get()
  // Each assistant message is a separate paragraph; without the break two
  // messages run together ("Let me check.Found it.").
  const chunk = row?.outputText ? `\n\n${text}` : text
  db.update(toolCallsTable).set({ outputText: (row?.outputText ?? "") + chunk }).where(eq(toolCallsTable.id, parent.id)).run()
  emit(agentId, parent.id, { kind: "text", text: chunk })
}

function recordSubCall(agentId: string, parent: ParentCall, block: { id: string; name: string; input: unknown }): void {
  const siblings = db.select({ n: count() }).from(toolCallsTable).where(eq(toolCallsTable.parentId, parent.id)).get()
  const args = JSON.stringify(block.input)
  try {
    db.insert(toolCallsTable).values({
      id: block.id,
      messageId: parent.messageId,
      parentId: parent.id,
      tool: block.name,
      args,
      orderIdx: siblings?.n ?? 0,
    }).run()
  } catch {
    return // duplicate ID from the provider replaying events
  }
  emit(agentId, parent.id, { kind: "toolCall", toolCall: { id: block.id, tool: block.name, args } })
}

function recordSubCallResult(agentId: string, parent: ParentCall, toolCallId: string, result: string): void {
  db.update(toolCallsTable)
    .set({ result })
    .where(and(eq(toolCallsTable.id, toolCallId), eq(toolCallsTable.parentId, parent.id)))
    .run()
  emit(agentId, parent.id, { kind: "toolResult", toolCallId, result })
}

/** Map a CLI task status onto the statuses the UI knows. */
export function toSubagentStatus(status: unknown): SubagentStatus | undefined {
  if (status === "running" || status === "pending") return "running"
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  if (typeof status === "string") return "stopped"
  return undefined
}

/**
 * Handle a CLI `system` task event (`task_started`, `task_progress`,
 * `task_updated`, `task_notification`). Only tasks that belong to an Agent
 * tool call are tracked; background Bash tasks emit the same events.
 */
export function handleSubagentTaskEvent(agentId: string, event: Record<string, unknown>): void {
  const taskId = typeof event.task_id === "string" ? event.task_id : undefined
  const toolUseId = typeof event.tool_use_id === "string"
    ? event.tool_use_id
    : taskId ? agentTasks.get(agentId)?.toolUseIds.get(taskId) : undefined
  if (!toolUseId) return
  const row = db.select({ tool: toolCallsTable.tool }).from(toolCallsTable).where(eq(toolCallsTable.id, toolUseId)).get()
  if (!row || !isAgentTool(row.tool)) return

  const description = typeof event.description === "string" ? event.description : undefined
  switch (event.subtype) {
    case "task_started":
      if (taskId) tasksFor(agentId).toolUseIds.set(taskId, toolUseId)
      if (event.is_backgrounded === true) {
        tasksFor(agentId).backgrounded.add(toolUseId)
        noteBackgroundAgent(agentId, { toolUseId, taskId, label: description ?? "Sub-agent" })
      }
      setStatus(agentId, toolUseId, { status: "running" })
      return
    case "task_progress":
      setStatus(agentId, toolUseId, { status: "running", progress: description })
      return
    case "task_updated": {
      const status = toSubagentStatus((event.patch as { status?: unknown } | undefined)?.status)
      if (status && status !== "running") finishTask(agentId, toolUseId, taskId, { status })
      return
    }
    case "task_notification": {
      const summary = typeof event.summary === "string" && event.summary ? event.summary : undefined
      finishTask(agentId, toolUseId, taskId, { status: toSubagentStatus(event.status) ?? "completed", summary })
      return
    }
  }
}

function finishTask(
  agentId: string,
  toolUseId: string,
  taskId: string | undefined,
  patch: { status: SubagentStatus; summary?: string },
): void {
  const tasks = agentTasks.get(agentId)
  if (taskId) tasks?.toolUseIds.delete(taskId)
  tasks?.backgrounded.delete(toolUseId)
  dropBackgroundTask(agentId, toolUseId)
  setStatus(agentId, toolUseId, patch)
}

function setStatus(
  agentId: string,
  toolUseId: string,
  patch: { status: SubagentStatus; summary?: string; progress?: string },
): void {
  db.update(toolCallsTable)
    .set({
      subagentStatus: patch.status,
      ...(patch.summary !== undefined ? { subagentSummary: patch.summary } : {}),
      ...(patch.progress !== undefined ? { subagentProgress: patch.progress } : {}),
    })
    .where(eq(toolCallsTable.id, toolUseId))
    .run()
  emit(agentId, toolUseId, { kind: "status", ...patch })
}

/**
 * The tool result of an Agent call landed. For a foreground sub-agent that
 * result is its answer, so the run is over even if the CLI sends no finishing
 * task event. A background sub-agent's result is only the launch receipt.
 */
export function noteAgentToolResult(agentId: string, toolUseId: string): void {
  if (agentTasks.get(agentId)?.backgrounded.has(toolUseId)) return
  const row = db.select({ status: toolCallsTable.subagentStatus }).from(toolCallsTable).where(eq(toolCallsTable.id, toolUseId)).get()
  if (row?.status !== "running") return
  setStatus(agentId, toolUseId, { status: "completed" })
}

/**
 * The agent's process exited: any sub-agent still marked running died with
 * it. Without this the UI would spin on those runs forever.
 */
export function settleRunningSubagents(agentId: string): void {
  agentTasks.delete(agentId)
  const running = db.select({ id: toolCallsTable.id })
    .from(toolCallsTable)
    .innerJoin(messagesTable, eq(messagesTable.id, toolCallsTable.messageId))
    .where(and(eq(messagesTable.agentId, agentId), eq(toolCallsTable.subagentStatus, "running")))
    .all()
  if (running.length === 0) return
  db.update(toolCallsTable)
    .set({ subagentStatus: "stopped" })
    .where(inArray(toolCallsTable.id, running.map((r) => r.id)))
    .run()
  for (const { id } of running) emit(agentId, id, { kind: "status", status: "stopped" })
}

/** At boot no process is alive, so no sub-agent can still be running. */
export function resetRunningSubagents(): void {
  db.update(toolCallsTable).set({ subagentStatus: "stopped" }).where(eq(toolCallsTable.subagentStatus, "running")).run()
}

function emit(agentId: string, toolUseId: string, update: SubagentUpdate): void {
  agentsWs.subagentUpdate(agentId, toolUseId, update)
}
