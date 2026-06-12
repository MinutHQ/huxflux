import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { agents as agentsTable, messages as messagesTable, repos as reposTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, silenceLogs, type TestDb, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { bootstrapTurn } from "./bootstrapTurn.js"
import type { ProviderAdapter } from "../../providers/providers.types.js"
import type { RunnerOptions } from "../../agents/agents.types.js"

function fakeProvider(sessionResume = true): ProviderAdapter {
  return {
    id: "claude",
    name: "Claude",
    capabilities: {
      sessionResume, sessionContinue: true, planMode: true, streamingJson: true,
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
  agentId: string
  repoId: string
}

function setup(title = "Real Title"): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const agentId = "agent-boot-1"
  const repoId = "repo-boot-1"
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: repoId, name: "owner/repo", path: "/tmp/no-such",
    workspacesPath: "/tmp/no-such/.workspaces",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
  testDb.db.insert(agentsTable).values({
    id: agentId, repoId, title, status: "in-progress", branch: "wip/real",
    model: "Sonnet 4.6", location: "loc", provider: "claude",
    createdAt: now, updatedAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return { testDb, capture, logs, agentId, repoId }
}

function buildOpts(ctx: Ctx, extra: Partial<RunnerOptions> = {}): RunnerOptions {
  return {
    agentId: ctx.agentId,
    worktreePath: "/tmp/no-such-worktree",
    ...extra,
  }
}

describe("bootstrapTurn", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close(); ctx.logs.restore() })

  it("persists the user message and a skeleton assistant message on a fresh turn", async () => {
    const result = await bootstrapTurn("hello there", buildOpts(ctx), fakeProvider())
    expect(result.isContinuation).toBe(false)
    const allMsgs = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, ctx.agentId)).all()
    expect(allMsgs).toHaveLength(2)
    expect(allMsgs.some((m: { role: string; content: string }) => m.role === "user" && m.content === "hello there")).toBe(true)
    expect(allMsgs.some((m: { role: string; id: string }) => m.role === "assistant" && m.id === result.messageId)).toBe(true)
  })

  it("marks the agent as streaming and emits message:start", async () => {
    await bootstrapTurn("first message", buildOpts(ctx), fakeProvider())
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.streaming).toBe(1)
    const started = ctx.capture.events.find((e) => e.type === "message:start")
    expect(started).toBeDefined()
  })

  it("reports isContinuation=true when prior messages exist", async () => {
    const now = new Date().toISOString()
    ctx.testDb.db.insert(messagesTable).values({
      id: "older", agentId: ctx.agentId, role: "user", content: "older",
      timestamp: now, createdAt: now,
    }).run()
    const result = await bootstrapTurn("follow-up", buildOpts(ctx), fakeProvider())
    expect(result.isContinuation).toBe(true)
  })

  it("falls back to process.cwd() when the worktreePath does not exist on disk", async () => {
    const result = await bootstrapTurn("hi", buildOpts(ctx, { worktreePath: "/totally/missing/path" }), fakeProvider())
    expect(result.cwd).toBe(process.cwd())
  })

  it("clears any stale sessionId when the provider doesn't support resume", async () => {
    ctx.testDb.db.update(agentsTable).set({ sessionId: "stale-sess" }).where(eq(agentsTable.id, ctx.agentId)).run()
    await bootstrapTurn("hi", buildOpts(ctx), fakeProvider(false))
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.sessionId).toBeNull()
  })

  it("does not downgrade an in-review agent during bootstrap", async () => {
    ctx.testDb.db.update(agentsTable).set({ status: "in-review" }).where(eq(agentsTable.id, ctx.agentId)).run()
    const result = await bootstrapTurn("hi", buildOpts(ctx), fakeProvider())
    expect(result.preRunStatus).toBe("in-review")
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.status).toBe("in-review")
  })

  it("does not downgrade a draft-pr agent during bootstrap", async () => {
    ctx.testDb.db.update(agentsTable).set({ status: "draft-pr" }).where(eq(agentsTable.id, ctx.agentId)).run()
    const result = await bootstrapTurn("hi", buildOpts(ctx), fakeProvider())
    expect(result.preRunStatus).toBe("draft-pr")
    const row = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(row.status).toBe("draft-pr")
  })
})
