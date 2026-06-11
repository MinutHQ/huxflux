import { afterEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { agents as agentsTable, repos as reposTable, fileChanges as fileChangesTable } from "../../db/schema.js"
import {
  createTestDb, createGitTmpRepo, silenceLogs, waitFor,
  type TestDb, type GitTmpRepo, type SilencedLogs,
} from "../../../test/harness.js"
import { watchAgent, unwatchWorktree } from "./watcher.js"

interface Ctx {
  testDb: TestDb
  repo: GitTmpRepo
  logs: SilencedLogs
  agentId: string
}

const REPO_ID = "repo-watch-1"

// Wire the agent's worktree to be the throwaway git repo itself:
// watchAgent computes `join(repo.workspacesPath, agent.location)`, so we set
// workspacesPath to the repo's parent and location to its basename.
function setupAgent(overrides: { noWorktree?: boolean; location?: string } = {}): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const repo = createGitTmpRepo()
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: REPO_ID,
    name: "owner/repo",
    path: repo.path,
    workspacesPath: path.dirname(repo.path),
    branchFrom: "main",
    remote: "origin",
    createdAt: now,
  }).run()
  const agentId = "agent-watch-1"
  testDb.db.insert(agentsTable).values({
    id: agentId, title: "T", status: "in-progress", branch: "main",
    model: "Sonnet 4.6", location: overrides.location ?? path.basename(repo.path),
    provider: "claude", repoId: REPO_ID, noWorktree: overrides.noWorktree ? 1 : 0,
    createdAt: now, updatedAt: now,
  }).run()
  return { testDb, repo, logs, agentId }
}

function teardown(ctx: Ctx) {
  unwatchWorktree(ctx.agentId)
  ctx.testDb.close()
  ctx.repo.cleanup()
  ctx.logs.restore()
}

describe("watchAgent", () => {
  let ctx: Ctx
  afterEach(() => teardown(ctx))

  it("starts watching the agent's worktree and populates file changes", async () => {
    ctx = setupAgent()
    await fs.writeFile(path.join(ctx.repo.path, "new.txt"), "line1\nline2\n")

    watchAgent(ctx.agentId)

    const rows = await waitFor(() => {
      const r = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
      return r.length > 0 ? r : undefined
    })
    expect(rows.map((r: { path: string }) => r.path)).toContain("new.txt")
  })

  it("refreshes file changes when a watched file appears after the initial scan", async () => {
    ctx = setupAgent()
    watchAgent(ctx.agentId)
    // Wait for the initial refresh to settle (no files yet).
    await new Promise((r) => setTimeout(r, 150))

    // Create a file AFTER watching — only the fs.watch event can surface this.
    await fs.writeFile(path.join(ctx.repo.path, "later.txt"), "hello\n")

    const rows = await waitFor(() => {
      const r = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
      return r.some((row: { path: string }) => row.path === "later.txt") ? r : undefined
    }, { timeoutMs: 8000 })
    expect(rows.map((r: { path: string }) => r.path)).toContain("later.txt")
  })

  it("is a no-op for an agent flagged noWorktree", async () => {
    ctx = setupAgent({ noWorktree: true })
    await fs.writeFile(path.join(ctx.repo.path, "new.txt"), "x\n")

    watchAgent(ctx.agentId)

    await new Promise((r) => setTimeout(r, 150))
    const rows = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
    expect(rows).toHaveLength(0)
  })

  it("is a no-op when the resolved worktree path does not exist", async () => {
    ctx = setupAgent({ location: "does-not-exist" })

    watchAgent(ctx.agentId)

    await new Promise((r) => setTimeout(r, 150))
    const rows = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
    expect(rows).toHaveLength(0)
  })
})

describe("watchAgent for a missing agent", () => {
  it("does not throw when the agent id is unknown", () => {
    const testDb = createTestDb()
    try {
      expect(() => watchAgent("no-such-agent")).not.toThrow()
    } finally {
      testDb.close()
    }
  })
})
