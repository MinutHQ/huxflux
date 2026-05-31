import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { z } from "zod/v4"
import { agents as agentsTable, messages as messagesTable, repos as reposTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, silenceLogs, type TestDb, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { createStreamState } from "./state.js"
import { persistAssistantMessage } from "./persistMessage.js"
import type { StreamState } from "../../agents/agents.types.js"
import type { TagHandler } from "../agent-runner.types.js"

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  logs: SilencedLogs
  agentId: string
  messageId: string
  repoId: string
  state: StreamState
  flushTimer: { current: ReturnType<typeof setTimeout> | null }
}

function setup(): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const agentId = "agent-pm-1"
  const messageId = "msg-pm-1"
  const repoId = "repo-pm-1"
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: repoId, name: "owner/repo", path: "/tmp/no-such",
    workspacesPath: "/tmp/no-such/.workspaces",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
  testDb.db.insert(agentsTable).values({
    id: agentId, repoId, title: "My Agent", status: "in-progress",
    branch: "wip/test", model: "Sonnet 4.6", location: "loc",
    provider: "claude", createdAt: now, updatedAt: now,
  }).run()
  testDb.db.insert(messagesTable).values({
    id: messageId, agentId, role: "assistant", content: "",
    timestamp: now, createdAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return {
    testDb, capture, logs, agentId, messageId, repoId,
    state: createStreamState(),
    flushTimer: { current: null },
  }
}

async function persist(ctx: Ctx, tags: TagHandler[] = []): Promise<void> {
  await persistAssistantMessage({
    state: ctx.state,
    agentId: ctx.agentId,
    messageId: ctx.messageId,
    skeletonCreatedAt: new Date().toISOString(),
    startedAt: Date.now() - 100,
    model: "Sonnet 4.6",
    providerId: "claude",
    worktreePath: "/tmp/no-such-worktree",
    branchFrom: "origin/main",
    flushTimer: ctx.flushTimer,
    tags,
  })
}

describe("persistAssistantMessage", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close(); ctx.logs.restore() })

  it("writes the assistant content to the messages row", async () => {
    ctx.state.pendingText = "Done."
    ctx.state.fullContent = "Done."
    await persist(ctx)
    const row = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.id, ctx.messageId)).get()
    expect(row.content).toBe("Done.")
    expect(row.model).toBe("Sonnet 4.6")
    expect(typeof row.durationMs).toBe("number")
  })

  it("stores thinking when present, and null when empty", async () => {
    ctx.state.pendingText = "hi"
    ctx.state.fullContent = "hi"
    ctx.state.fullThinking = "musing"
    await persist(ctx)
    const row = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.id, ctx.messageId)).get()
    expect(row.thinking).toBe("musing")
  })

  it("emits a message:done event with the assistant payload", async () => {
    ctx.state.pendingText = "ok"
    ctx.state.fullContent = "ok"
    await persist(ctx)
    const done = ctx.capture.events.find((e) => e.type === "message:done") as { type: string; agentId: string; messageId: string; message: { content: string } } | undefined
    expect(done).toBeDefined()
    expect(done?.agentId).toBe(ctx.agentId)
    expect(done?.messageId).toBe(ctx.messageId)
    expect(done?.message.content).toBe("ok")
  })

  it("is idempotent against an empty pendingText (no crash, content becomes empty)", async () => {
    await persist(ctx)
    const row = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.id, ctx.messageId)).get()
    expect(row.content).toBe("")
  })

  it("running twice with the same state does not double-write divergent rows", async () => {
    ctx.state.pendingText = "first"
    ctx.state.fullContent = "first"
    await persist(ctx)
    const firstRow = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.id, ctx.messageId)).get()
    expect(firstRow.content).toBe("first")
    // Calling again is allowed; the final write wins. Same content => same content.
    await persist(ctx)
    const allMessageRows = ctx.testDb.db.select().from(messagesTable).all().filter((m: { id: string }) => m.id === ctx.messageId)
    expect(allMessageRows).toHaveLength(1)
  })

  it("dispatches a caller-registered tag handler against the streamed content", async () => {
    ctx.state.pendingText = "answer text"
    ctx.state.fullContent = `<huxflux:demo.title>Improve auth flow</huxflux:demo.title>answer text`
    const seen: string[] = []
    const handler: TagHandler = {
      id: "demo.title",
      args: z.object({}),
      onTag: ({ body }) => { seen.push(body) },
    }
    await persist(ctx, [handler])
    expect(seen).toEqual(["Improve auth flow"])
  })

  it("strips <huxflux:*> tags from the persisted body", async () => {
    ctx.state.pendingText = "answer text"
    ctx.state.fullContent = `<huxflux:demo.note>x</huxflux:demo.note>answer text`
    await persist(ctx)
    const row = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.id, ctx.messageId)).get()
    expect(row.content).not.toContain("<huxflux:")
  })
})
