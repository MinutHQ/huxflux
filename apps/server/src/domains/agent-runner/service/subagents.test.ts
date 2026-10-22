import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { agents as agentsTable, toolCalls as toolCallsTable, messages as messagesTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, type TestDb, type CapturedWsEvents } from "../../../../test/harness.js"
import { createStreamState } from "./state.js"
import { handleStreamEvent } from "./claudeStreamEvent.js"
import { handleSubagentMessage, handleSubagentTaskEvent, resetRunningSubagents, settleRunningSubagents, toSubagentStatus } from "./subagents.js"
import { clearBackgroundState, getBackgroundState } from "./backgroundTasks.js"
import type { ClaudeStreamEvent, StreamState } from "../../agents/agents.types.js"

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  state: StreamState
  agentId: string
  messageId: string
}

function setup(): Ctx {
  const testDb = createTestDb()
  const agentId = "agent-1"
  const messageId = "message-1"
  const now = new Date().toISOString()
  testDb.db.insert(agentsTable).values({
    id: agentId, title: "t", status: "in-progress", branch: "main",
    model: "Sonnet 4.6", location: "loc", provider: "claude",
    createdAt: now, updatedAt: now,
  }).run()
  testDb.db.insert(messagesTable).values({
    id: messageId, agentId, role: "assistant", content: "",
    timestamp: now, createdAt: now,
  }).run()
  return { testDb, capture: captureWsEvents([agentId]), state: createStreamState(), agentId, messageId }
}

function feed(ctx: Ctx, event: Record<string, unknown>): void {
  handleStreamEvent(event as unknown as ClaudeStreamEvent, ctx.state, ctx.agentId, ctx.messageId, () => {})
}

function row(ctx: Ctx, id: string) {
  return ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.id, id)).get()
}

function updates(ctx: Ctx) {
  return ctx.capture.events.flatMap((e) => (e.type === "subagent:update" ? [{ toolUseId: e.toolUseId, update: e.update }] : []))
}

function agentToolUse(id: string, tool = "Agent"): Record<string, unknown> {
  return { type: "assistant", message: { content: [{ type: "tool_use", id, name: tool, input: { description: "Run cat", prompt: "cat a.txt" } }] } }
}

describe("sub-agent runs from a real CLI stream", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { clearBackgroundState(ctx.agentId); ctx.capture.restore(); ctx.testDb.close() })

  // Event sequence captured from Claude CLI 2.1.308 running one background
  // sub-agent, trimmed to the fields the runner reads.
  it("tracks a background sub-agent from launch to completion", () => {
    feed(ctx, agentToolUse("toolu_agent"))
    feed(ctx, {
      type: "system", subtype: "task_started", task_id: "task1", tool_use_id: "toolu_agent",
      description: "Run cat on a.txt", is_backgrounded: true, task_type: "local_agent",
    })
    expect(getBackgroundState(ctx.agentId).tasks).toMatchObject([{ toolUseId: "toolu_agent", kind: "agent", taskId: "task1", label: "Run cat on a.txt" }])

    feed(ctx, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_agent", content: [{ type: "text", text: "Async agent launched successfully." }] }] } })
    expect(row(ctx, "toolu_agent").subagentStatus).toBe("running")

    feed(ctx, { type: "assistant", parent_tool_use_id: "toolu_agent", message: { content: [{ type: "tool_use", id: "toolu_bash", name: "Bash", input: { command: "cat a.txt" } }] } })
    feed(ctx, { type: "system", subtype: "task_progress", task_id: "task1", tool_use_id: "toolu_agent", description: "Running Print contents of a.txt" })
    feed(ctx, { type: "user", parent_tool_use_id: "toolu_agent", message: { content: [{ type: "tool_result", tool_use_id: "toolu_bash", content: "hi" }] } })
    feed(ctx, { type: "assistant", parent_tool_use_id: "toolu_agent", message: { content: [{ type: "text", text: "Checking." }] } })
    feed(ctx, { type: "assistant", parent_tool_use_id: "toolu_agent", message: { content: [{ type: "text", text: "The file contains hi." }] } })
    feed(ctx, { type: "system", subtype: "task_updated", task_id: "task1", patch: { status: "completed" } })
    feed(ctx, { type: "system", subtype: "task_notification", task_id: "task1", tool_use_id: "toolu_agent", status: "completed", summary: "The file contains hi." })

    const agent = row(ctx, "toolu_agent")
    expect(agent.subagentStatus).toBe("completed")
    expect(agent.subagentSummary).toBe("The file contains hi.")
    expect(agent.subagentProgress).toBe("Running Print contents of a.txt")
    expect(agent.outputText).toBe("Checking.\n\nThe file contains hi.")

    const bash = row(ctx, "toolu_bash")
    expect(bash.parentId).toBe("toolu_agent")
    expect(bash.messageId).toBe(ctx.messageId)
    expect(bash.result).toBe("hi")

    // Sub-agent content never leaks into the parent turn.
    expect(ctx.state.collectedToolCalls.map((t) => t.id)).toEqual(["toolu_agent"])
    expect(ctx.state.fullContent).toBe("")
    expect(getBackgroundState(ctx.agentId).tasks).toEqual([])

    expect(updates(ctx).map((u) => u.update.kind)).toEqual([
      "status", "toolCall", "status", "toolResult", "text", "text", "status", "status",
    ])
    expect(updates(ctx).every((u) => u.toolUseId === "toolu_agent")).toBe(true)
    expect(updates(ctx)[5]?.update).toEqual({ kind: "text", text: "\n\nThe file contains hi." })
  })

  it("completes a foreground sub-agent when its tool result lands", () => {
    feed(ctx, agentToolUse("toolu_fg"))
    feed(ctx, { type: "system", subtype: "task_started", task_id: "t", tool_use_id: "toolu_fg", is_backgrounded: false })
    feed(ctx, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_fg", content: "the answer" }] } })
    expect(row(ctx, "toolu_fg").subagentStatus).toBe("completed")
    expect(getBackgroundState(ctx.agentId).tasks).toEqual([])
  })

  it("nests a sub-agent's own sub-agent under the call that spawned it", () => {
    feed(ctx, agentToolUse("toolu_outer"))
    feed(ctx, { type: "assistant", parent_tool_use_id: "toolu_outer", message: { content: [{ type: "tool_use", id: "toolu_inner", name: "Agent", input: {} }] } })
    feed(ctx, { type: "assistant", parent_tool_use_id: "toolu_inner", message: { content: [{ type: "tool_use", id: "toolu_read", name: "Read", input: {} }, { type: "text", text: "inner says" }] } })

    expect(row(ctx, "toolu_inner").parentId).toBe("toolu_outer")
    expect(row(ctx, "toolu_read").parentId).toBe("toolu_inner")
    expect(row(ctx, "toolu_inner").outputText).toBe("inner says")
    expect(row(ctx, "toolu_outer").outputText).toBeNull()
  })

  it("orders sub-calls in the order they arrived", () => {
    feed(ctx, agentToolUse("toolu_agent"))
    for (const id of ["a", "b", "c"]) {
      feed(ctx, { type: "assistant", parent_tool_use_id: "toolu_agent", message: { content: [{ type: "tool_use", id, name: "Read", input: {} }] } })
    }
    expect(["a", "b", "c"].map((id) => row(ctx, id).orderIdx)).toEqual([0, 1, 2])
  })

  it("ignores a replayed sub-agent tool call", () => {
    feed(ctx, agentToolUse("toolu_agent"))
    const event = { type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_read", name: "Read", input: {} }] } }
    handleSubagentMessage(ctx.agentId, "toolu_agent", event)
    handleSubagentMessage(ctx.agentId, "toolu_agent", event)
    expect(updates(ctx).filter((u) => u.update.kind === "toolCall")).toHaveLength(1)
  })

  it("drops events whose parent tool call is unknown", () => {
    handleSubagentMessage(ctx.agentId, "toolu_missing", { type: "assistant", message: { content: [{ type: "text", text: "lost" }] } })
    expect(ctx.capture.events).toEqual([])
  })

  it("ignores task events that belong to a background Bash call", () => {
    feed(ctx, agentToolUse("toolu_bash", "Bash"))
    handleSubagentTaskEvent(ctx.agentId, { subtype: "task_started", task_id: "t", tool_use_id: "toolu_bash", is_backgrounded: true })
    expect(row(ctx, "toolu_bash").subagentStatus).toBeNull()
    expect(updates(ctx)).toEqual([])
  })

  it("supports the older Task tool name", () => {
    feed(ctx, agentToolUse("toolu_task", "Task"))
    handleSubagentTaskEvent(ctx.agentId, { subtype: "task_started", task_id: "t", tool_use_id: "toolu_task" })
    expect(row(ctx, "toolu_task").subagentStatus).toBe("running")
  })
})

describe("settling sub-agents when the process is gone", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("marks this agent's running sub-agents stopped and tells clients", () => {
    feed(ctx, agentToolUse("toolu_running"))
    feed(ctx, agentToolUse("toolu_done"))
    handleSubagentTaskEvent(ctx.agentId, { subtype: "task_started", tool_use_id: "toolu_running" })
    handleSubagentTaskEvent(ctx.agentId, { subtype: "task_notification", tool_use_id: "toolu_done", status: "completed" })

    settleRunningSubagents(ctx.agentId)

    expect(row(ctx, "toolu_running").subagentStatus).toBe("stopped")
    expect(row(ctx, "toolu_done").subagentStatus).toBe("completed")
    expect(updates(ctx).at(-1)).toEqual({ toolUseId: "toolu_running", update: { kind: "status", status: "stopped" } })
  })

  it("resets every running sub-agent at boot", () => {
    feed(ctx, agentToolUse("toolu_running"))
    handleSubagentTaskEvent(ctx.agentId, { subtype: "task_started", tool_use_id: "toolu_running" })
    resetRunningSubagents()
    expect(row(ctx, "toolu_running").subagentStatus).toBe("stopped")
  })
})

describe("toSubagentStatus", () => {
  it("maps CLI task statuses", () => {
    expect(toSubagentStatus("running")).toBe("running")
    expect(toSubagentStatus("pending")).toBe("running")
    expect(toSubagentStatus("completed")).toBe("completed")
    expect(toSubagentStatus("failed")).toBe("failed")
    expect(toSubagentStatus("killed")).toBe("stopped")
    expect(toSubagentStatus(undefined)).toBeUndefined()
  })
})
