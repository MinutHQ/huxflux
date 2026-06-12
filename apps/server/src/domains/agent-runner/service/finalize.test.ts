import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { agents as agentsTable, messages as messagesTable, repos as reposTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, silenceLogs, type TestDb, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { createStreamState } from "./state.js"
import { makeFinalize } from "./finalize.js"
import { runningProcesses } from "./processRegistry.js"
import type { ProviderAdapter } from "../../providers/providers.types.js"
import type { StreamState } from "../../agents/agents.types.js"
import type { RunAgentOptions } from "../agent-runner.types.js"

function fakeProvider(): ProviderAdapter {
  return {
    id: "claude",
    name: "Claude",
    capabilities: {
      sessionResume: true, sessionContinue: true, planMode: true, streamingJson: true,
      toolUseEvents: true, thinkingBlocks: true, askUserQuestion: true,
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
  agentId: string
  messageId: string
  state: StreamState
}

function setup(streaming = 1, status = "in-progress"): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const agentId = "agent-fin-1"
  const messageId = "msg-fin-1"
  const repoId = "repo-fin-1"
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: repoId, name: "o/r", path: "/tmp/x", workspacesPath: "/tmp/x/w",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
  testDb.db.insert(agentsTable).values({
    id: agentId, repoId, title: "T", status, branch: "b",
    model: "Sonnet 4.6", location: "loc", provider: "claude", streaming,
    createdAt: now, updatedAt: now,
  }).run()
  testDb.db.insert(messagesTable).values({
    id: messageId, agentId, role: "assistant", content: "",
    timestamp: now, createdAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return { testDb, capture, logs, agentId, messageId, state: createStreamState() }
}

function buildArgs(ctx: Ctx, opts: Partial<RunAgentOptions> = {}, preRunStatus = "in-progress") {
  return {
    state: ctx.state,
    agentId: ctx.agentId,
    messageId: ctx.messageId,
    skeletonCreatedAt: new Date().toISOString(),
    startedAt: Date.now() - 50,
    model: "Sonnet 4.6",
    provider: fakeProvider(),
    cwd: "/tmp/x",
    branchFrom: "origin/main",
    preRunStatus,
    flushTimer: { current: null as ReturnType<typeof setTimeout> | null },
    bufferRef: { current: "" },
    scheduleFlush: () => { /* noop */ },
    opts: { agentId: ctx.agentId, worktreePath: "/tmp/x", ...opts } as RunAgentOptions,
    tags: [],
  }
}

describe("makeFinalize", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => {
    ctx.capture.restore(); ctx.testDb.close(); ctx.logs.restore()
    runningProcesses.delete(ctx.agentId)
  })

  it("clears the streaming flag and bumps unread on a normal exit", async () => {
    ctx.state.pendingText = "done"
    ctx.state.fullContent = "done"
    const finalize = makeFinalize(buildArgs(ctx))
    await finalize()
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.streaming).toBe(0)
    expect(row.unread).toBeGreaterThanOrEqual(1)
    expect(row.status).toBe("in-progress")
  })

  it("preserves in-review status across finalization", async () => {
    ctx.testDb.db.update(agentsTable).set({ status: "in-review" }).where(eq(agentsTable.id, ctx.agentId)).run()
    const finalize = makeFinalize(buildArgs(ctx, {}, "in-review"))
    await finalize()
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.status).toBe("in-review")
    expect(row.streaming).toBe(0)
  })

  it("preserves draft-pr status across finalization", async () => {
    ctx.testDb.db.update(agentsTable).set({ status: "draft-pr" }).where(eq(agentsTable.id, ctx.agentId)).run()
    const finalize = makeFinalize(buildArgs(ctx, {}, "draft-pr"))
    await finalize()
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.status).toBe("draft-pr")
    expect(row.streaming).toBe(0)
  })

  it("is idempotent: calling twice does not double-bump unread", async () => {
    const finalize = makeFinalize(buildArgs(ctx))
    await finalize()
    const after1 = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get().unread
    await finalize()
    const after2 = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get().unread
    expect(after2).toBe(after1)
  })

  it("removes the agent from runningProcesses regardless of prior state", async () => {
    runningProcesses.set(ctx.agentId, { pid: 12345 } as unknown as Parameters<typeof runningProcesses.set>[1])
    const finalize = makeFinalize(buildArgs(ctx))
    await finalize()
    expect(runningProcesses.has(ctx.agentId)).toBe(false)
  })
})
