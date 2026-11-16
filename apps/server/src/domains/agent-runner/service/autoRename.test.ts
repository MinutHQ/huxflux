import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { agents as agentsTable, messages as messagesTable, repos as reposTable } from "../../../db/schema.js"
import { createTestDb, captureWsEvents, silenceLogs, type TestDb, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { tryAutoRename } from "./autoRename.js"

// Point the claude binary at a path that does not exist, so the Haiku title
// call fails fast and tryAutoRename falls back to deriving the title from the
// message. The resolver reads this lazily and caches it per test file.
vi.stubEnv("CLAUDE_BIN", "/nonexistent/huxflux-test-claude")

const PARENT_ID = "agent-root"
const CHILD_ID = "agent-child"

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  logs: SilencedLogs
}

function setup(childTitle: string): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: "repo-1", name: "owner/repo", path: "/tmp/no-such",
    workspacesPath: "/tmp/no-such/.workspaces",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
  for (const [id, title, parentAgentId] of [[PARENT_ID, "Parent work", null], [CHILD_ID, childTitle, PARENT_ID]] as const) {
    testDb.db.insert(agentsTable).values({
      id, repoId: "repo-1", title, status: "in-progress", branch: "wip/parent-work",
      model: "Sonnet 4.6", location: "loc", provider: "claude", parentAgentId,
      createdAt: now, updatedAt: now,
    }).run()
  }
  testDb.db.insert(messagesTable).values({
    id: "msg-1", agentId: CHILD_ID, role: "user",
    content: "Fix the flaky login test. It fails on CI only", timestamp: now, createdAt: now,
  }).run()
  return { testDb, capture: captureWsEvents([CHILD_ID]), logs }
}

function childRow(ctx: Ctx) {
  return ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, CHILD_ID)).get()
}

describe("tryAutoRename for child chat sessions", () => {
  let ctx: Ctx

  afterEach(() => {
    ctx.capture.restore()
    ctx.testDb.close()
    ctx.logs.restore()
  })

  describe("when the child is still Untitled", () => {
    beforeEach(() => { ctx = setup("Untitled") })

    it("titles the child from its first user message", async () => {
      await tryAutoRename(CHILD_ID, "origin/main")
      expect(childRow(ctx)?.title).toBe("Fix the flaky login test")
    })

    it("leaves the shared branch alone", async () => {
      await tryAutoRename(CHILD_ID, "origin/main")
      expect(childRow(ctx)?.branch).toBe("wip/parent-work")
    })

    it("broadcasts the new title so open tabs update", async () => {
      await tryAutoRename(CHILD_ID, "origin/main")
      const updates = ctx.capture.events.filter((e) => e.type === "agent:updated")
      expect(updates).toHaveLength(1)
      expect(updates[0]).toMatchObject({ agent: { id: CHILD_ID, title: "Fix the flaky login test" } })
    })
  })

  describe("when the turn-start and turn-end renames overlap", () => {
    beforeEach(() => { ctx = setup("Untitled") })

    it("renames and broadcasts only once", async () => {
      await Promise.all([tryAutoRename(CHILD_ID, "origin/main"), tryAutoRename(CHILD_ID, "origin/main")])
      expect(ctx.capture.events.filter((e) => e.type === "agent:updated")).toHaveLength(1)
    })
  })

  describe("when the child already has a real title", () => {
    beforeEach(() => { ctx = setup("Investigate CI") })

    it("keeps the title", async () => {
      await tryAutoRename(CHILD_ID, "origin/main")
      expect(childRow(ctx)?.title).toBe("Investigate CI")
      expect(ctx.capture.events.filter((e) => e.type === "agent:updated")).toHaveLength(0)
    })
  })
})
