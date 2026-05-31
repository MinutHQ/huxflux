import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { agents as agentsTable, toolCalls as toolCallsTable, messages as messagesTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, type TestDb, type CapturedWsEvents } from "../../../../test/harness.js"
import { createStreamState } from "./state.js"
import { handleStreamEvent } from "./claudeStreamEvent.js"
import type { ClaudeStreamEvent, StreamState } from "../../agents/agents.types.js"

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  state: StreamState
  scheduleFlush: () => void
  flushCount: { value: number }
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
  const capture = captureWsEvents([agentId])
  const flushCount = { value: 0 }
  return {
    testDb, capture, agentId, messageId,
    state: createStreamState(),
    scheduleFlush: () => { flushCount.value++ },
    flushCount,
  }
}

describe("handleStreamEvent — assistant text blocks", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("accumulates text into pendingText AND fullContent", () => {
    const event: ClaudeStreamEvent = {
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello" }, { type: "text", text: " world" }] },
    }
    handleStreamEvent(event, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    expect(ctx.state.pendingText).toBe("Hello world")
    expect(ctx.state.fullContent).toBe("Hello world")
    expect(ctx.flushCount.value).toBe(2)
  })

  it("emits message:chunk for each text block", () => {
    const event: ClaudeStreamEvent = {
      type: "assistant",
      message: { content: [{ type: "text", text: "abc" }] },
    }
    handleStreamEvent(event, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    const chunks = ctx.capture.events.filter((e) => e.type === "message:chunk")
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ type: "message:chunk", agentId: ctx.agentId, messageId: ctx.messageId, delta: "abc" })
  })
})

describe("handleStreamEvent — thinking blocks", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("accumulates thinking into fullThinking but not fullContent", () => {
    const event: ClaudeStreamEvent = {
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "pondering..." }] },
    }
    handleStreamEvent(event, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    expect(ctx.state.fullThinking).toBe("pondering...")
    expect(ctx.state.fullContent).toBe("")
    expect(ctx.state.pendingText).toBe("")
  })

  it("emits a message:thinking event", () => {
    const event: ClaudeStreamEvent = {
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "x" }] },
    }
    handleStreamEvent(event, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    const thinks = ctx.capture.events.filter((e) => e.type === "message:thinking")
    expect(thinks).toHaveLength(1)
  })
})

describe("handleStreamEvent — tool_use blocks", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("attaches pendingText to the tool call and resets pendingText", () => {
    handleStreamEvent(
      { type: "assistant", message: { content: [{ type: "text", text: "Let me check." }] } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    handleStreamEvent(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "tu_1", name: "Read", input: { path: "x" } }] } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.pendingText).toBe("")
    expect(ctx.state.collectedToolCalls).toHaveLength(1)
    expect(ctx.state.collectedToolCalls[0]).toMatchObject({
      id: "tu_1",
      tool: "Read",
      precedingText: "Let me check.",
    })
    expect(ctx.state.toolCallOrderIdx).toBe(1)
  })

  it("persists the tool call row immediately so reloads see it", () => {
    handleStreamEvent(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "tu_2", name: "Bash", input: { cmd: "ls" } }] } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    const row = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.id, "tu_2")).get()
    expect(row).toBeDefined()
    expect(row.tool).toBe("Bash")
    expect(row.args).toBe(JSON.stringify({ cmd: "ls" }))
  })

  it("tolerates duplicate tool_use ids by swallowing the unique-constraint error", () => {
    const dup: ClaudeStreamEvent = {
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "tu_3", name: "Read", input: {} }] },
    }
    handleStreamEvent(dup, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    expect(() =>
      handleStreamEvent(dup, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    ).not.toThrow()
  })
})

describe("handleStreamEvent — tool_result, result/usage, system:init", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("stores tool_result content on the matching collected call and updates the DB row", () => {
    handleStreamEvent(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "tu_4", name: "Read", input: {} }] } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    handleStreamEvent(
      { type: "tool_result", tool_use_id: "tu_4", content: "file contents" },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    const tc = ctx.state.collectedToolCalls.find((t) => t.id === "tu_4")
    expect(tc?.result).toBe("file contents")
    const row = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.id, "tu_4")).get()
    expect(row.result).toBe("file contents")
  })

  it("captures usage from result events", () => {
    handleStreamEvent(
      { type: "result", usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.inputTokens).toBe(100)
    expect(ctx.state.outputTokens).toBe(50)
    expect(ctx.state.cacheReadTokens).toBe(10)
    expect(ctx.state.cacheWriteTokens).toBe(5)
  })

  it("persists the session id on system:init", () => {
    handleStreamEvent(
      { type: "system", subtype: "init", session_id: "sess-1" },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.sessionId).toBe("sess-1")
  })
})

describe("handleStreamEvent — subagent routing and unknown events", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("routes events with parent_tool_use_id to subagentEvent and skips content processing", () => {
    handleStreamEvent(
      { type: "assistant", parent_tool_use_id: "tu_parent", message: { content: [{ type: "text", text: "should not accumulate" }] } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.fullContent).toBe("")
    expect(ctx.capture.events.some((e) => e.type === "subagent:event")).toBe(true)
  })

  it("forwards unrecognized event types as subagent + terminal lines", () => {
    handleStreamEvent(
      { type: "weird_unknown_event", tool_use_id: "tu_x" } as ClaudeStreamEvent,
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.capture.events.some((e) => e.type === "subagent:event")).toBe(true)
    expect(ctx.capture.events.some((e) => e.type === "terminal:line")).toBe(true)
  })

  it("silently drops `system` events without an init subtype", () => {
    const before = ctx.capture.events.length
    handleStreamEvent(
      { type: "system" },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.capture.events.length).toBe(before)
  })
})
