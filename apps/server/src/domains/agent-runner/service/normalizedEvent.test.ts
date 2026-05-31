import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { agents as agentsTable, toolCalls as toolCallsTable, messages as messagesTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, type TestDb, type CapturedWsEvents } from "../../../../test/harness.js"
import { createStreamState } from "./state.js"
import { handleNormalizedEvent } from "./normalizedEvent.js"
import type { NormalizedStreamEvent } from "../../providers/providers.types.js"
import type { StreamState } from "../../agents/agents.types.js"

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  state: StreamState
  scheduleFlush: () => void
  agentId: string
  messageId: string
}

function setup(): Ctx {
  const testDb = createTestDb()
  const agentId = "agent-norm-1"
  const messageId = "message-norm-1"
  const now = new Date().toISOString()
  testDb.db.insert(agentsTable).values({
    id: agentId, title: "t", status: "in-progress", branch: "main",
    model: "Sonnet 4.6", location: "loc", provider: "codex",
    createdAt: now, updatedAt: now,
  }).run()
  testDb.db.insert(messagesTable).values({
    id: messageId, agentId, role: "assistant", content: "",
    timestamp: now, createdAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return {
    testDb, capture, agentId, messageId,
    state: createStreamState(),
    scheduleFlush: () => { /* noop */ },
  }
}

describe("handleNormalizedEvent — text, thinking, usage", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("accumulates text deltas into pendingText and fullContent", () => {
    const e1: NormalizedStreamEvent = { type: "text", text: "a" }
    const e2: NormalizedStreamEvent = { type: "text", text: "bc" }
    handleNormalizedEvent(e1, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    handleNormalizedEvent(e2, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    expect(ctx.state.pendingText).toBe("abc")
    expect(ctx.state.fullContent).toBe("abc")
  })

  it("accumulates thinking but does not write to fullContent", () => {
    handleNormalizedEvent(
      { type: "thinking", text: "musing" },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.fullThinking).toBe("musing")
    expect(ctx.state.fullContent).toBe("")
  })

  it("captures usage token counts", () => {
    handleNormalizedEvent(
      { type: "usage", inputTokens: 7, outputTokens: 13, cacheReadTokens: 1, cacheWriteTokens: 2 },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.inputTokens).toBe(7)
    expect(ctx.state.outputTokens).toBe(13)
    expect(ctx.state.cacheReadTokens).toBe(1)
    expect(ctx.state.cacheWriteTokens).toBe(2)
  })
})

describe("handleNormalizedEvent — tool use lifecycle", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("attaches pendingText to the tool call and persists it", () => {
    handleNormalizedEvent({ type: "text", text: "thinking..." }, ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush)
    handleNormalizedEvent(
      { type: "tool_use", id: "tu_n_1", name: "Read", input: { path: "f" } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.pendingText).toBe("")
    expect(ctx.state.collectedToolCalls[0].precedingText).toBe("thinking...")
    const row = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.id, "tu_n_1")).get()
    expect(row).toBeDefined()
  })

  it("records tool_result on the in-memory call and updates the row when toolUseId is set", () => {
    handleNormalizedEvent(
      { type: "tool_use", id: "tu_n_2", name: "Read", input: {} },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    handleNormalizedEvent(
      { type: "tool_result", toolUseId: "tu_n_2", content: "ok" },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.collectedToolCalls[0].result).toBe("ok")
    const row = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.id, "tu_n_2")).get()
    expect(row.result).toBe("ok")
  })
})

describe("handleNormalizedEvent — session, subagent, error", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close() })

  it("persists session id on session_init", () => {
    handleNormalizedEvent(
      { type: "session_init", sessionId: "sess-norm" },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.sessionId).toBe("sess-norm")
  })

  it("forwards subagent events to the WS layer without touching state", () => {
    handleNormalizedEvent(
      { type: "subagent", toolUseId: "tu_p", event: { foo: "bar" } },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.fullContent).toBe("")
    expect(ctx.capture.events.some((e) => e.type === "subagent:event")).toBe(true)
  })

  it("surfaces error messages into pendingText/fullContent and emits an error event", () => {
    handleNormalizedEvent(
      { type: "error", message: "boom" },
      ctx.state, ctx.agentId, ctx.messageId, ctx.scheduleFlush,
    )
    expect(ctx.state.pendingText).toContain("Error: boom")
    expect(ctx.state.fullContent).toContain("Error: boom")
    expect(ctx.capture.events.some((e) => e.type === "error")).toBe(true)
  })
})
