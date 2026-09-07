import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type { ChildProcess } from "node:child_process"
import { agents as agentsTable, messages as messagesTable, toolCalls as toolCallsTable, repos as reposTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, silenceLogs, type TestDb, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { runningProcesses } from "../../agent-runner/service/processRegistry.js"
import { buildConversationContext } from "../../providers/context.js"
import { enqueue, clearQueue } from "./messageQueue.js"
import { clearConversation, isClearCommand } from "./clearConversation.js"

const AGENT_ID = "agent-clear-1"
const OTHER_AGENT_ID = "agent-clear-2"

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  logs: SilencedLogs
}

function seedAgent(testDb: TestDb, id: string, sessionId: string | null): void {
  const now = new Date().toISOString()
  testDb.db.insert(agentsTable).values({
    id, repoId: "repo-clear-1", title: "T", status: "in-progress", branch: "b",
    model: "Sonnet 4.6", location: `loc-${id}`, provider: "claude", streaming: 0,
    sessionId, createdAt: now, updatedAt: now,
  }).run()
  testDb.db.insert(messagesTable).values([
    { id: `${id}-m1`, agentId: id, role: "user", content: "hello", timestamp: now, createdAt: now },
    { id: `${id}-m2`, agentId: id, role: "assistant", content: "hi", timestamp: now, createdAt: now },
  ]).run()
  testDb.db.insert(toolCallsTable).values({
    id: `${id}-tc1`, messageId: `${id}-m2`, tool: "Read", orderIdx: 0,
  }).run()
}

function setup(): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: "repo-clear-1", name: "o/r", path: "/tmp/x", workspacesPath: "/tmp/x/w",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
  seedAgent(testDb, AGENT_ID, "sess-abc")
  seedAgent(testDb, OTHER_AGENT_ID, "sess-other")
  const capture = captureWsEvents([AGENT_ID, OTHER_AGENT_ID])
  return { testDb, capture, logs }
}

describe("isClearCommand", () => {
  it("matches only the bare /clear command", () => {
    expect(isClearCommand("/clear")).toBe(true)
    expect(isClearCommand("  /clear \n")).toBe(true)
    expect(isClearCommand("/clear please")).toBe(false)
    expect(isClearCommand("please /clear")).toBe(false)
    expect(isClearCommand("clear")).toBe(false)
  })
})

describe("clearConversation", () => {
  let ctx: Ctx

  beforeEach(() => { ctx = setup() })
  afterEach(() => {
    runningProcesses.delete(AGENT_ID)
    clearQueue(AGENT_ID)
    ctx.capture.restore()
    ctx.testDb.close()
    ctx.logs.restore()
  })

  it("deletes the agent's messages and tool calls and nulls the session id", () => {
    const result = clearConversation(AGENT_ID)

    expect(result).toEqual({ ok: true, deletedMessages: 2 })
    const msgs = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, AGENT_ID)).all()
    expect(msgs).toHaveLength(0)
    const tcs = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.messageId, `${AGENT_ID}-m2`)).all()
    expect(tcs).toHaveLength(0)
    const agent = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, AGENT_ID)).get()
    expect(agent?.sessionId).toBeNull()
  })

  it("leaves other agents untouched", () => {
    clearConversation(AGENT_ID)

    const otherMsgs = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, OTHER_AGENT_ID)).all()
    expect(otherMsgs).toHaveLength(2)
    const otherTcs = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.messageId, `${OTHER_AGENT_ID}-m2`)).all()
    expect(otherTcs).toHaveLength(1)
    const other = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, OTHER_AGENT_ID)).get()
    expect(other?.sessionId).toBe("sess-other")
  })

  it("emits messages:cleared to the agent's subscribers", () => {
    clearConversation(AGENT_ID)

    const cleared = ctx.capture.events.filter((e) => e.type === "messages:cleared")
    expect(cleared).toEqual([{ type: "messages:cleared", agentId: AGENT_ID }])
  })

  it("leaves nothing for the non-resume provider context builder to replay", () => {
    expect(buildConversationContext(AGENT_ID)).not.toBe("")

    clearConversation(AGENT_ID)

    expect(buildConversationContext(AGENT_ID)).toBe("")
  })

  it("drops any queued messages for the agent", () => {
    enqueue(AGENT_ID, { content: "later", worktreePath: "/tmp/x", model: "Sonnet 4.6" })

    clearConversation(AGENT_ID)

    expect(clearQueue(AGENT_ID)).toBe(0)
  })

  it("refuses while the agent is running and changes nothing", () => {
    runningProcesses.set(AGENT_ID, {} as ChildProcess)

    const result = clearConversation(AGENT_ID)

    expect(result).toEqual({ ok: false, reason: "running" })
    const msgs = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, AGENT_ID)).all()
    expect(msgs).toHaveLength(2)
    const agent = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, AGENT_ID)).get()
    expect(agent?.sessionId).toBe("sess-abc")
    expect(ctx.capture.events.filter((e) => e.type === "messages:cleared")).toHaveLength(0)
  })

  it("reports not-found for an unknown agent", () => {
    expect(clearConversation("nope")).toEqual({ ok: false, reason: "not-found" })
  })

  it("is a no-op success on an agent with no messages", () => {
    clearConversation(AGENT_ID)

    const again = clearConversation(AGENT_ID)

    expect(again).toEqual({ ok: true, deletedMessages: 0 })
  })
})
