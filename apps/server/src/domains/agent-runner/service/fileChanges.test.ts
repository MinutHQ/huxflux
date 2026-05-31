import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { execFileSync } from "node:child_process"
import { agents as agentsTable, fileChanges as fileChangesTable } from "../../../db/schema.js"
import { createTestDb, createGitTmpRepo, captureWsEvents, silenceLogs, type TestDb, type GitTmpRepo, type CapturedWsEvents, type SilencedLogs } from "../../../../test/harness.js"
import { refreshFileChanges } from "./fileChanges.js"

interface Ctx { testDb: TestDb; repo: GitTmpRepo; capture: CapturedWsEvents; logs: SilencedLogs; agentId: string }

function setup(): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const repo = createGitTmpRepo()
  const agentId = "agent-fc-1"
  const now = new Date().toISOString()
  testDb.db.insert(agentsTable).values({
    id: agentId, title: "T", status: "in-progress", branch: "main",
    model: "Sonnet 4.6", location: "loc", provider: "claude",
    createdAt: now, updatedAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return { testDb, repo, capture, logs, agentId }
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" })
}

describe("refreshFileChanges", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = setup() })
  afterEach(() => { ctx.capture.restore(); ctx.testDb.close(); ctx.repo.cleanup(); ctx.logs.restore() })

  it("records an added (untracked) file", async () => {
    await fs.writeFile(path.join(ctx.repo.path, "new.txt"), "line1\nline2\n")
    await refreshFileChanges(ctx.agentId, ctx.repo.path, "HEAD")
    const rows = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].path).toBe("new.txt")
    expect(rows[0].additions).toBeGreaterThan(0)
  })

  it("records a modified file's diff stats", async () => {
    await fs.writeFile(path.join(ctx.repo.path, "f.txt"), "a\nb\nc\n")
    git(ctx.repo.path, "add", ".")
    git(ctx.repo.path, "commit", "-q", "-m", "add f")
    await fs.writeFile(path.join(ctx.repo.path, "f.txt"), "a\nB\nc\nd\n")
    await refreshFileChanges(ctx.agentId, ctx.repo.path, "HEAD")
    const rows = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
    const f = rows.find((r: { path: string }) => r.path === "f.txt")
    expect(f).toBeDefined()
    expect(f.additions).toBeGreaterThanOrEqual(1)
    expect(f.deletions).toBeGreaterThanOrEqual(1)
  })

  it("records a deleted file", async () => {
    await fs.writeFile(path.join(ctx.repo.path, "g.txt"), "to delete\n")
    git(ctx.repo.path, "add", ".")
    git(ctx.repo.path, "commit", "-q", "-m", "add g")
    await fs.rm(path.join(ctx.repo.path, "g.txt"))
    await refreshFileChanges(ctx.agentId, ctx.repo.path, "HEAD")
    const rows = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
    expect(rows.some((r: { path: string; deletions: number }) => r.path === "g.txt" && r.deletions > 0)).toBe(true)
  })

  it("emits a file:changed WS event with the full file list", async () => {
    await fs.writeFile(path.join(ctx.repo.path, "x.txt"), "hi\n")
    await refreshFileChanges(ctx.agentId, ctx.repo.path, "HEAD")
    const ev = ctx.capture.events.find((e) => e.type === "file:changed") as { type: string; files: Array<{ path: string }> } | undefined
    expect(ev).toBeDefined()
    expect(ev?.files.some((f) => f.path === "x.txt")).toBe(true)
  })

  it("does not crash when a binary-like file is committed", async () => {
    const buf = Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 7])
    await fs.writeFile(path.join(ctx.repo.path, "bin.dat"), buf)
    git(ctx.repo.path, "add", ".")
    git(ctx.repo.path, "commit", "-q", "-m", "bin")
    // Modify a couple bytes
    const buf2 = Buffer.from([0, 1, 2, 9, 9, 9, 9, 0, 7])
    await fs.writeFile(path.join(ctx.repo.path, "bin.dat"), buf2)
    await expect(refreshFileChanges(ctx.agentId, ctx.repo.path, "HEAD")).resolves.toBeUndefined()
  })

  it("replaces stale rows so removed files disappear from the list", async () => {
    await fs.writeFile(path.join(ctx.repo.path, "first.txt"), "a\n")
    await refreshFileChanges(ctx.agentId, ctx.repo.path, "HEAD")
    let rows = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
    expect(rows.some((r: { path: string }) => r.path === "first.txt")).toBe(true)

    await fs.rm(path.join(ctx.repo.path, "first.txt"))
    await refreshFileChanges(ctx.agentId, ctx.repo.path, "HEAD")
    rows = ctx.testDb.db.select().from(fileChangesTable).where(eq(fileChangesTable.agentId, ctx.agentId)).all()
    expect(rows.some((r: { path: string }) => r.path === "first.txt")).toBe(false)
  })
})
