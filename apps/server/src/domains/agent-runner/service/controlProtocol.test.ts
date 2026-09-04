import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type { ChildProcess } from "node:child_process"
import { agents as agentsTable, messages as messagesTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, type TestDb, type CapturedWsEvents } from "../../../../test/harness.js"
import { getPendingQuestion, clearPendingQuestion } from "../../../askStore.js"
import { runningProcesses } from "./processRegistry.js"
import { createStreamState } from "./state.js"
import { registerTurnSplitter, unregisterTurnSplitter, makeTurnSplitter, type TurnSegmentRef } from "./turnSegments.js"
import {
  handleControlRequest,
  answerPendingQuestion,
  injectUserMessage,
  buildUserMessageLine,
  type ControlRequestEvent,
} from "./controlProtocol.js"

interface FakeProc {
  written: string[]
  proc: ChildProcess
}

function makeFakeProc(): FakeProc {
  const written: string[] = []
  const proc = {
    stdin: {
      destroyed: false,
      writable: true,
      write: (line: string) => { written.push(line); return true },
    },
  } as unknown as ChildProcess
  return { written, proc }
}

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  agentId: string
  fake: FakeProc
}

function setup(): Ctx {
  const testDb = createTestDb()
  const agentId = "agent-cp-1"
  const now = new Date().toISOString()
  testDb.db.insert(agentsTable).values({
    id: agentId, title: "t", status: "in-progress", branch: "main",
    model: "Sonnet 4.6", location: "loc", provider: "claude",
    createdAt: now, updatedAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  const fake = makeFakeProc()
  runningProcesses.set(agentId, fake.proc)
  return { testDb, capture, agentId, fake }
}

function teardown(ctx: Ctx): void {
  runningProcesses.delete(ctx.agentId)
  unregisterTurnSplitter(ctx.agentId)
  clearPendingQuestion(ctx.agentId)
  ctx.capture.restore()
  ctx.testDb.close()
}

const questions = [
  { question: "Which color?", header: "Color", options: [{ label: "Red" }, { label: "Blue" }] },
]

function askRequest(requestId = "req-1", toolUseId = "tu-1"): ControlRequestEvent {
  return {
    type: "control_request",
    request_id: requestId,
    request: { subtype: "can_use_tool", tool_name: "AskUserQuestion", input: { questions }, tool_use_id: toolUseId },
  }
}

describe("handleControlRequest", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => teardown(ctx))

  it("parks an AskUserQuestion request and emits ask:question without responding yet", () => {
    handleControlRequest(askRequest(), ctx.agentId, ctx.fake.proc)
    const pending = getPendingQuestion(ctx.agentId)
    expect(pending).toBeDefined()
    expect(pending!.requestId).toBe("req-1")
    expect(pending!.toolUseId).toBe("tu-1")
    expect(pending!.questions).toEqual(questions)
    const askEvents = ctx.capture.events.filter((e) => e.type === "ask:question")
    expect(askEvents).toHaveLength(1)
    expect(askEvents[0]).toMatchObject({ agentId: ctx.agentId, toolUseId: "tu-1" })
    expect(ctx.fake.written).toHaveLength(0)
  })

  it("denies AskUserQuestion with a malformed questions payload", () => {
    handleControlRequest(
      { type: "control_request", request_id: "req-2", request: { subtype: "can_use_tool", tool_name: "AskUserQuestion", input: { questions: "nope" } } },
      ctx.agentId, ctx.fake.proc,
    )
    expect(getPendingQuestion(ctx.agentId)).toBeUndefined()
    expect(ctx.fake.written).toHaveLength(1)
    const response = JSON.parse(ctx.fake.written[0]!)
    expect(response.type).toBe("control_response")
    expect(response.response.request_id).toBe("req-2")
    expect(response.response.response.behavior).toBe("deny")
  })

  it("denies can_use_tool requests for other tools", () => {
    handleControlRequest(
      { type: "control_request", request_id: "req-3", request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" } } },
      ctx.agentId, ctx.fake.proc,
    )
    expect(ctx.fake.written).toHaveLength(1)
    const response = JSON.parse(ctx.fake.written[0]!)
    expect(response.response.request_id).toBe("req-3")
    expect(response.response.response.behavior).toBe("deny")
  })

  it("clears the pending question on control_cancel_request", () => {
    handleControlRequest(askRequest(), ctx.agentId, ctx.fake.proc)
    expect(getPendingQuestion(ctx.agentId)).toBeDefined()
    handleControlRequest({ type: "control_cancel_request", request_id: "req-1" }, ctx.agentId, ctx.fake.proc)
    expect(getPendingQuestion(ctx.agentId)).toBeUndefined()
  })

  it("ignores requests without a request_id or unknown subtypes", () => {
    handleControlRequest({ type: "control_request", request: { subtype: "can_use_tool", tool_name: "Bash" } }, ctx.agentId, ctx.fake.proc)
    handleControlRequest({ type: "control_request", request_id: "req-4", request: { subtype: "something_else" } }, ctx.agentId, ctx.fake.proc)
    expect(ctx.fake.written).toHaveLength(0)
  })
})

describe("answerPendingQuestion", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => teardown(ctx))

  it("writes an allow control_response with questions + answers and clears pending state", () => {
    handleControlRequest(askRequest(), ctx.agentId, ctx.fake.proc)
    const ok = answerPendingQuestion(ctx.agentId, { "Which color?": "Blue" })
    expect(ok).toBe(true)
    expect(getPendingQuestion(ctx.agentId)).toBeUndefined()
    expect(ctx.fake.written).toHaveLength(1)
    const response = JSON.parse(ctx.fake.written[0]!)
    expect(response.type).toBe("control_response")
    expect(response.response.subtype).toBe("success")
    expect(response.response.request_id).toBe("req-1")
    expect(response.response.response.behavior).toBe("allow")
    expect(response.response.response.updatedInput).toEqual({
      questions,
      answers: { "Which color?": "Blue" },
    })
  })

  it("returns false when there is no pending question", () => {
    expect(answerPendingQuestion(ctx.agentId, { q: "a" })).toBe(false)
  })

  it("returns false and keeps pending state when the process is gone", () => {
    handleControlRequest(askRequest(), ctx.agentId, ctx.fake.proc)
    runningProcesses.delete(ctx.agentId)
    expect(answerPendingQuestion(ctx.agentId, { "Which color?": "Blue" })).toBe(false)
    expect(getPendingQuestion(ctx.agentId)).toBeDefined()
  })
})

describe("injectUserMessage", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => teardown(ctx))

  it("writes a stream-json user message, persists it, and emits message:user with injected flag", () => {
    const ok = injectUserMessage(ctx.agentId, "STOP and say POTATO")
    expect(ok).toBe(true)
    expect(ctx.fake.written).toHaveLength(1)
    expect(JSON.parse(ctx.fake.written[0]!)).toEqual(JSON.parse(buildUserMessageLine("STOP and say POTATO")))

    const rows = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, ctx.agentId)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.role).toBe("user")
    expect(rows[0]!.content).toBe("STOP and say POTATO")

    const userEvents = ctx.capture.events.filter((e) => e.type === "message:user")
    expect(userEvents).toHaveLength(1)
    expect((userEvents[0] as { message: { injected?: boolean } }).message.injected).toBe(true)
  })

  it("splits the running turn: closes the current segment and opens a new one below the injection", () => {
    const skeletonCreatedAt = new Date(Date.now() - 60_000).toISOString()
    ctx.testDb.db.insert(messagesTable).values({
      id: "skeleton-1", agentId: ctx.agentId, role: "assistant", content: "",
      timestamp: skeletonCreatedAt, createdAt: skeletonCreatedAt,
    }).run()
    const state = createStreamState()
    state.pendingText = "work so far"
    state.fullThinking = "hmm"
    state.fullContent = "work so far"
    state.collectedToolCalls.push({ id: "tc-1", tool: "Bash", args: "{}" })
    state.toolCallOrderIdx = 1
    const turnRef: TurnSegmentRef = { messageId: "skeleton-1", createdAt: skeletonCreatedAt, startedAt: Date.now() - 5000 }
    registerTurnSplitter(ctx.agentId, makeTurnSplitter({ agentId: ctx.agentId, model: "m", state, turnRef }))

    expect(injectUserMessage(ctx.agentId, "steer!")).toBe(true)

    const rows = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, ctx.agentId)).all()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    // seg1 (closed) → injected user message → seg2 (fresh skeleton)
    expect(rows.map((r) => r.role)).toEqual(["assistant", "user", "assistant"])
    const [seg1, injected, seg2] = rows
    expect(seg1!.id).toBe("skeleton-1")
    expect(seg1!.content).toBe("work so far")
    expect(seg1!.durationMs).not.toBeNull()
    expect(injected!.content).toBe("steer!")
    expect(seg2!.content).toBe("")
    expect(seg2!.id).toBe(turnRef.messageId)

    // stream state now targets the fresh segment
    expect(state.pendingText).toBe("")
    expect(state.collectedToolCalls).toEqual([])
    expect(state.toolCallOrderIdx).toBe(0)
    expect(state.fullContent).toBe("work so far")

    const types = ctx.capture.events.map((e) => e.type)
    expect(types).toContain("message:done")
    expect(types).toContain("message:start")
    expect(types.indexOf("message:done")).toBeGreaterThan(types.indexOf("message:user"))
  })

  it("returns false without persisting when there is no running process", () => {
    runningProcesses.delete(ctx.agentId)
    expect(injectUserMessage(ctx.agentId, "hello")).toBe(false)
    const rows = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, ctx.agentId)).all()
    expect(rows).toHaveLength(0)
  })

  it("returns false when stdin is not writable (argv-prompt providers)", () => {
    const noStdin = {} as unknown as ChildProcess
    runningProcesses.set(ctx.agentId, noStdin)
    expect(injectUserMessage(ctx.agentId, "hello")).toBe(false)
  })
})
