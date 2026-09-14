import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { agents as agentsTable, messages as messagesTable, terminalLines as terminalLinesTable, toolCalls as toolCallsTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, silenceLogs, waitFor, type TestDb, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { createStreamState } from "./state.js"
import { ABORTED_EXIT_CODE, startInProcessTurn } from "./inProcessTurn.js"
import { runningProcesses, stopAgent } from "./processRegistry.js"
import { answerPendingQuestion, injectUserMessage } from "./controlProtocol.js"
import { getPendingQuestion, clearPendingQuestion } from "../../../askStore.js"
import { unregisterTurnSplitter } from "./turnSegments.js"
import type { NormalizedStreamEvent, ProviderAdapter, RunTurnContext, SpawnOptions } from "../../providers/providers.types.js"
import type { StreamState } from "../../agents/agents.types.js"

type InProcessProvider = ProviderAdapter & { runTurn: NonNullable<ProviderAdapter["runTurn"]> }

function makeProvider(runTurn: InProcessProvider["runTurn"]): InProcessProvider {
  return {
    id: "agent-sdk",
    name: "Fake SDK",
    capabilities: {
      sessionResume: true, sessionContinue: true, planMode: true, streamingJson: true,
      toolUseEvents: true, thinkingBlocks: true, askUserQuestion: false,
      systemPromptFlag: true, allowedToolsRestriction: true, subAgentSupport: true,
      effortLevels: [],
    },
    resolveBinary: () => "fake",
    isAvailable: () => true,
    buildSpawnArgs: () => { throw new Error("in-process") },
    parseStreamLine: () => null,
    resolveModel: (m) => m,
    getModels: () => [],
    runTurn,
  }
}

function spawnOptions(): SpawnOptions {
  return { prompt: "p", model: "m", planMode: false, sessionId: null, isContinuation: false, cwd: "/tmp", systemPrompt: "s" }
}

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  logs: SilencedLogs
  state: StreamState
  agentId: string
  messageId: string
}

function setup(): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const agentId = "agent-ip-1"
  const messageId = "msg-ip-1"
  const now = new Date().toISOString()
  testDb.db.insert(agentsTable).values({
    id: agentId, title: "T", status: "in-progress", branch: "main",
    model: "Sonnet 4.6", location: "loc", provider: "agent-sdk",
    createdAt: now, updatedAt: now,
  }).run()
  testDb.db.insert(messagesTable).values({
    id: messageId, agentId, role: "assistant", content: "", timestamp: now, createdAt: now,
  }).run()
  return { testDb, capture: captureWsEvents([agentId]), logs, agentId, messageId, state: createStreamState() }
}

function start(ctx: Ctx, provider: InProcessProvider): Promise<number> {
  return startInProcessTurn({
    provider, spawnOptions: spawnOptions(), env: { FOO: "bar" }, state: ctx.state, agentId: ctx.agentId,
    turnRef: { messageId: ctx.messageId, createdAt: new Date().toISOString(), startedAt: Date.now() },
    scheduleFlush: () => { /* noop */ },
  })
}

describe("startInProcessTurn", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => {
    ctx.capture.restore(); ctx.testDb.close(); ctx.logs.restore()
    runningProcesses.delete(ctx.agentId)
    unregisterTurnSplitter(ctx.agentId)
    clearPendingQuestion(ctx.agentId)
  })

  it("feeds every event through the normalized pipeline and exits 0", async () => {
    let receivedCtx: RunTurnContext | undefined
    const provider = makeProvider(async function* (opts, runCtx) {
      receivedCtx = runCtx
      expect(opts.prompt).toBe("p")
      yield { type: "session_init", sessionId: "sess-1" }
      yield { type: "thinking", text: "hmm" }
      yield { type: "text", text: "before " }
      yield { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "a" } }
      yield { type: "tool_result", toolUseId: "tu-1", content: "contents" }
      yield { type: "text", text: "after" }
      yield { type: "usage", inputTokens: 5, outputTokens: 7, contextTokens: 123, contextWindow: 200_000 }
      yield { type: "done", result: "after" }
    })

    const code = await start(ctx, provider)

    expect(code).toBe(0)
    expect(receivedCtx?.env).toEqual({ FOO: "bar" })
    expect(receivedCtx?.signal.aborted).toBe(false)
    expect(ctx.state.fullThinking).toBe("hmm")
    expect(ctx.state.fullContent).toBe("before after")
    expect(ctx.state.pendingText).toBe("after")
    expect(ctx.state.collectedToolCalls).toEqual([
      { id: "tu-1", tool: "Read", args: JSON.stringify({ file_path: "a" }), precedingText: "before ", result: "contents" },
    ])
    expect(ctx.state.inputTokens).toBe(5)
    expect(ctx.state.contextTokens).toBe(123)
    expect(ctx.state.contextWindow).toBe(200_000)

    const agent = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(agent.sessionId).toBe("sess-1")
    const tc = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.id, "tu-1")).get()
    expect(tc.result).toBe("contents")
    expect(ctx.capture.events.map((e) => e.type)).toEqual(expect.arrayContaining(["message:chunk", "message:thinking", "tool:call", "tool:result"]))
  })

  it("registers an abortable handle while running and reports the aborted code on stop", async () => {
    let signal: AbortSignal | undefined
    const provider = makeProvider(async function* (_opts, runCtx) {
      signal = runCtx.signal
      yield { type: "text", text: "started" }
      await new Promise<void>((resolve) => runCtx.signal.addEventListener("abort", () => resolve(), { once: true }))
      yield { type: "text", text: "never shown" }
    })

    const turn = start(ctx, provider)
    await waitFor(() => (ctx.state.fullContent === "started" ? true : null))
    expect(runningProcesses.has(ctx.agentId)).toBe(true)
    expect(runningProcesses.get(ctx.agentId)?.stdin?.writable).toBe(true)

    expect(stopAgent(ctx.agentId)).toBe(true)
    const code = await turn
    expect(signal?.aborted).toBe(true)
    expect(code).toBe(ABORTED_EXIT_CODE)
    expect(ctx.state.fullContent).toBe("started")
  })

  it("treats an iterator that throws after abort as aborted, not failed", async () => {
    const provider = makeProvider(async function* (_opts, runCtx) {
      yield { type: "text", text: "x" }
      await new Promise<void>((resolve) => runCtx.signal.addEventListener("abort", () => resolve(), { once: true }))
      throw new Error("AbortError")
    })
    const turn = start(ctx, provider)
    await waitFor(() => (ctx.state.fullContent === "x" ? true : null))
    stopAgent(ctx.agentId)
    expect(await turn).toBe(ABORTED_EXIT_CODE)
    expect(ctx.state.fullContent).toBe("x")
  })

  it("surfaces a thrown error as an error event and exits 1", async () => {
    const provider = makeProvider(async function* () {
      yield { type: "text", text: "partial" } as NormalizedStreamEvent
      throw new Error("sdk exploded")
    })

    const code = await start(ctx, provider)

    expect(code).toBe(1)
    expect(ctx.state.fullContent).toBe("partial\n\nError: sdk exploded")
    expect(ctx.capture.events.some((e) => e.type === "error")).toBe(true)
  })

  it("delivers injected user messages to the provider and ends them after done", async () => {
    const received: string[] = []
    let sawEnd = false
    const provider = makeProvider(async function* (_opts, runCtx) {
      yield { type: "text", text: "working" }
      const iterator = runCtx.userMessages[Symbol.asyncIterator]()
      const first = await iterator.next()
      received.push(first.value as string)
      yield { type: "text", text: " reply" }
      yield { type: "done", result: "reply" }
      // The runner closes the input on done; the next pull must end the stream.
      const after = await iterator.next()
      sawEnd = after.done === true
    })

    const turn = start(ctx, provider)
    await waitFor(() => (ctx.state.fullContent === "working" ? true : null))
    expect(injectUserMessage(ctx.agentId, "also do this", "viktor")).toBe(true)
    expect(await turn).toBe(0)
    expect(received).toEqual(["also do this"])
    expect(sawEnd).toBe(true)
    expect(ctx.capture.events.some((e) => e.type === "message:user")).toBe(true)
  })

  it("parks AskUserQuestion for the UI and resolves it with the user's answers", async () => {
    const questions = [{ question: "Which color?", header: "Color", options: [{ label: "Red" }, { label: "Blue" }] }]
    let decision: unknown
    const provider = makeProvider(async function* (_opts, runCtx) {
      yield { type: "tool_use", id: "ask-1", name: "AskUserQuestion", input: { questions } }
      decision = await runCtx.requestPermission({ toolName: "AskUserQuestion", input: { questions }, signal: runCtx.signal })
      yield { type: "done" }
    })

    const turn = start(ctx, provider)
    await waitFor(() => getPendingQuestion(ctx.agentId))
    const asked = ctx.capture.events.find((e) => e.type === "ask:question") as { toolUseId?: string } | undefined
    expect(asked?.toolUseId).toBe("ask-1")

    expect(answerPendingQuestion(ctx.agentId, { "Which color?": "Blue" })).toBe(true)
    expect(await turn).toBe(0)
    expect(decision).toEqual({ behavior: "allow", updatedInput: { questions, answers: { "Which color?": "Blue" } } })
    expect(getPendingQuestion(ctx.agentId)).toBeUndefined()
    expect(ctx.capture.events.some((e) => e.type === "ask:resolved")).toBe(true)
  })

  it("uses the provider's tool_use id for the question card when given", async () => {
    const questions = [{ question: "Q?", options: [{ label: "A" }] }]
    const provider = makeProvider(async function* (_opts, runCtx) {
      yield { type: "tool_use", id: "older-ask", name: "AskUserQuestion", input: { questions } }
      void runCtx.requestPermission({ toolName: "AskUserQuestion", input: { questions }, toolUseId: "explicit-id", signal: runCtx.signal })
      await waitFor(() => getPendingQuestion(ctx.agentId))
      yield { type: "done" }
    })
    const turn = start(ctx, provider)
    await waitFor(() => getPendingQuestion(ctx.agentId))
    expect(getPendingQuestion(ctx.agentId)?.toolUseId).toBe("explicit-id")
    stopAgent(ctx.agentId)
    await turn
  })

  it("denies permission requests for any other tool without involving the UI", async () => {
    let decision: unknown
    const provider = makeProvider(async function* (_opts, runCtx) {
      decision = await runCtx.requestPermission({ toolName: "Bash", input: { command: "rm -rf /" }, signal: runCtx.signal })
      yield { type: "done" }
    })
    expect(await start(ctx, provider)).toBe(0)
    expect(decision).toMatchObject({ behavior: "deny" })
    expect(ctx.capture.events.some((e) => e.type === "ask:question")).toBe(false)
  })

  it("answers a pending question with a deny and clears the card when the turn is stopped", async () => {
    const questions = [{ question: "Proceed?", options: [{ label: "Yes" }] }]
    let decision: unknown
    const provider = makeProvider(async function* (_opts, runCtx) {
      decision = await runCtx.requestPermission({ toolName: "AskUserQuestion", input: { questions }, signal: runCtx.signal })
      yield { type: "done" }
    })
    const turn = start(ctx, provider)
    await waitFor(() => getPendingQuestion(ctx.agentId))
    stopAgent(ctx.agentId)
    expect(await turn).toBe(ABORTED_EXIT_CODE)
    expect(decision).toMatchObject({ behavior: "deny" })
    expect(getPendingQuestion(ctx.agentId)).toBeUndefined()
    expect(ctx.capture.events.some((e) => e.type === "ask:resolved")).toBe(true)
  })

  it("writes provider stderr to the terminal lines", async () => {
    const provider = makeProvider(async function* (_opts, runCtx) {
      runCtx.onStderr("warn one\nwarn two\n")
      yield { type: "done" }
    })
    await start(ctx, provider)
    const lines = ctx.testDb.db.select().from(terminalLinesTable).where(eq(terminalLinesTable.agentId, ctx.agentId)).all()
    expect(lines.map((l: { line: string }) => l.line)).toEqual(["warn one", "warn two"])
  })
})
