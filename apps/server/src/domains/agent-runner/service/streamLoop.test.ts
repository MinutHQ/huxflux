import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { agents as agentsTable, messages as messagesTable, terminalLines as terminalLinesTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, silenceLogs, waitFor, type TestDb, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { createStreamState } from "./state.js"
import { spawnAndStream } from "./streamLoop.js"
import { runningProcesses } from "./processRegistry.js"
import type { ProviderAdapter } from "../../providers/providers.types.js"
import type { StreamState } from "../../agents/agents.types.js"

const __filename = fileURLToPath(import.meta.url)
const SERVER_ROOT = path.resolve(path.dirname(__filename), "..", "..", "..", "..")
const FAKE_BIN = path.join(SERVER_ROOT, "test", "fixtures", "fake-claude.mjs")
const FIXTURE_DIR = path.join(SERVER_ROOT, "test", "fixtures", "streams")

function claudeProvider(): ProviderAdapter {
  return {
    id: "claude",
    name: "Claude",
    capabilities: {
      sessionResume: true, sessionContinue: true, planMode: true, streamingJson: true,
      toolUseEvents: true, thinkingBlocks: true, askUserQuestion: false,
      systemPromptFlag: true, allowedToolsRestriction: true, subAgentSupport: true,
      effortLevels: [],
    },
    resolveBinary: () => "claude",
    isAvailable: () => true,
    buildSpawnArgs: () => ({ bin: "", args: [] }),
    parseStreamLine: () => null,
    resolveModel: (m) => m,
    getModels: () => [],
  }
}

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  logs: SilencedLogs
  state: StreamState
  agentId: string
  messageId: string
  scheduleFlush: () => void
  bufferRef: { current: string }
}

function setup(): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const agentId = "agent-sl-1"
  const messageId = "msg-sl-1"
  const now = new Date().toISOString()
  testDb.db.insert(agentsTable).values({
    id: agentId, title: "T", status: "in-progress", branch: "main",
    model: "Sonnet 4.6", location: "loc", provider: "claude",
    createdAt: now, updatedAt: now,
  }).run()
  testDb.db.insert(messagesTable).values({
    id: messageId, agentId, role: "assistant", content: "",
    timestamp: now, createdAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return {
    testDb, capture, logs, agentId, messageId,
    state: createStreamState(),
    scheduleFlush: () => { /* noop */ },
    bufferRef: { current: "" },
  }
}

function spawnFixture(ctx: Ctx, fixtureName: string) {
  const fixturePath = path.join(FIXTURE_DIR, fixtureName)
  return spawnAndStream({
    bin: process.execPath,
    args: [FAKE_BIN],
    cwd: SERVER_ROOT,
    env: { ...process.env, HUXFLUX_FAKE_FIXTURE: fixturePath, HUXFLUX_FAKE_DELAY_MS: "1" },
    provider: claudeProvider(),
    state: ctx.state,
    agentId: ctx.agentId,
    messageId: ctx.messageId,
    scheduleFlush: ctx.scheduleFlush,
    bufferRef: ctx.bufferRef,
  })
}

function waitForExit(proc: ReturnType<typeof spawnFixture>): Promise<number | null> {
  return new Promise((resolve) => { proc.on("close", (code) => resolve(code)) })
}

describe("spawnAndStream — happy path", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => {
    ctx.capture.restore(); ctx.testDb.close(); ctx.logs.restore()
    runningProcesses.delete(ctx.agentId)
  })

  it("accumulates text deltas across multiple lines into fullContent", async () => {
    const proc = spawnFixture(ctx, "happy-path.json")
    await waitForExit(proc)
    expect(ctx.state.fullContent).toContain("Hello ")
    expect(ctx.state.fullContent).toContain("world.")
    expect(ctx.state.fullContent).toContain(" All done.")
  })

  it("records the tool call in state and the session id on the agent row", async () => {
    const proc = spawnFixture(ctx, "happy-path.json")
    await waitForExit(proc)
    expect(ctx.state.collectedToolCalls).toHaveLength(1)
    expect(ctx.state.collectedToolCalls[0].tool).toBe("Read")
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.sessionId).toBe("test-session-happy")
  })

  it("captures usage tokens from the result event", async () => {
    const proc = spawnFixture(ctx, "happy-path.json")
    await waitForExit(proc)
    expect(ctx.state.inputTokens).toBe(50)
    expect(ctx.state.outputTokens).toBe(12)
  })
})

describe("spawnAndStream — stderr handling", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => {
    ctx.capture.restore(); ctx.testDb.close(); ctx.logs.restore()
    runningProcesses.delete(ctx.agentId)
  })

  it("writes stderr lines to terminal_lines and emits terminal:line events", async () => {
    const proc = spawnFixture(ctx, "error.json")
    const code = await waitForExit(proc)
    expect(code).toBe(1)
    await waitFor(() => {
      const rows = ctx.testDb.db.select().from(terminalLinesTable).all()
      return rows.length >= 2 ? rows : false
    })
    const rows = ctx.testDb.db.select().from(terminalLinesTable).all()
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const stderrEvents = ctx.capture.events.filter((e) => e.type === "terminal:line")
    expect(stderrEvents.length).toBeGreaterThanOrEqual(2)
  })

  it("captures partial assistant output before the non-zero exit", async () => {
    const proc = spawnFixture(ctx, "error.json")
    await waitForExit(proc)
    expect(ctx.state.fullContent).toContain("Partial output before crash")
  })
})

describe("spawnAndStream — malformed input tolerance", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => {
    ctx.capture.restore(); ctx.testDb.close(); ctx.logs.restore()
    runningProcesses.delete(ctx.agentId)
  })

  it("ignores non-JSON lines on stdout without crashing and still parses surrounding valid events", async () => {
    const proc = spawnFixture(ctx, "malformed.json")
    const code = await waitForExit(proc)
    expect(code).toBe(0)
    expect(ctx.state.fullContent).toBe("Recovered.")
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.sessionId).toBe("test-session-malformed")
  })
})
