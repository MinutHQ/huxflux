import { afterEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import * as path from "node:path"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { repos as reposTable, worktreePool } from "../../db/schema.js"
import {
  createTestDb, createGitTmpRepo, silenceLogs,
  type TestDb, type GitTmpRepo, type SilencedLogs,
} from "../../../test/harness.js"
import { ensureReserve, claimReserve, initializeReserves } from "./pool.js"

interface Ctx {
  testDb: TestDb
  repo: GitTmpRepo
  logs: SilencedLogs
  repoId: string
  workspacesPath: string
}

function setup(opts: { setupScript?: string | null } = {}): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const repo = createGitTmpRepo()
  const repoId = "repo-pool-1"
  // Worktrees live OUTSIDE the main repo dir (the git default expectation),
  // in their own tmpdir entry that we clean up explicitly in teardown.
  const workspacesPath = mkdtempSync(path.join(tmpdir(), "huxflux-test-ws-"))
  testDb.db.insert(reposTable).values({
    id: repoId,
    name: "owner/repo",
    path: repo.path,
    workspacesPath,
    branchFrom: "main",
    remote: "origin",
    setupScript: opts.setupScript ?? null,
    createdAt: new Date().toISOString(),
  }).run()
  return { testDb, repo, logs, repoId, workspacesPath }
}

function teardown(ctx: Ctx) {
  ctx.testDb.close()
  ctx.repo.cleanup()
  try { rmSync(ctx.workspacesPath, { recursive: true, force: true }) } catch { /* already gone */ }
  ctx.logs.restore()
}

describe("ensureReserve", () => {
  let ctx: Ctx

  afterEach(() => teardown(ctx))

  it("creates a reserve worktree for a repo with no setup script", async () => {
    ctx = setup({ setupScript: null })

    await ensureReserve(ctx.repoId)

    const rows = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].branch).toMatch(/^pool\//)
    expect(existsSync(path.join(ctx.workspacesPath, rows[0].location))).toBe(true)
  })

  it("creates a reserve worktree for a repo with a setup script (and runs it)", async () => {
    // A setup script that writes a marker file proves the spawn path still
    // runs when `setupScript` is non-null.
    ctx = setup({ setupScript: "touch ./.setup-ran" })

    await ensureReserve(ctx.repoId)

    const rows = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(rows).toHaveLength(1)
    const wtPath = path.join(ctx.workspacesPath, rows[0].location)
    expect(existsSync(path.join(wtPath, ".setup-ran"))).toBe(true)
  })

  it("is a no-op for folder-typed repos (no git remote)", async () => {
    ctx = setup({ setupScript: null })
    // Flip the repo to folder type after setup.
    ctx.testDb.db.update(reposTable).set({ type: "folder" }).where(eq(reposTable.id, ctx.repoId)).run()

    await ensureReserve(ctx.repoId)

    const rows = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(rows).toHaveLength(0)
  })

  it("is a no-op when a reserve already exists", async () => {
    ctx = setup({ setupScript: null })

    await ensureReserve(ctx.repoId)
    const first = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(first).toHaveLength(1)

    await ensureReserve(ctx.repoId)
    const second = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(second).toHaveLength(1)
    expect(second[0].id).toBe(first[0].id)
  })
})

describe("initializeReserves", () => {
  let ctx: Ctx
  afterEach(() => teardown(ctx))

  it("ensures a reserve exists even for repos without a setup script", async () => {
    ctx = setup({ setupScript: null })

    await initializeReserves()

    const rows = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(rows).toHaveLength(1)
  })
})

describe("claimReserve", () => {
  let ctx: Ctx
  afterEach(() => teardown(ctx))

  it("returns the reserve location, deletes the row, and triggers a background refill", async () => {
    ctx = setup({ setupScript: null })

    await ensureReserve(ctx.repoId)
    const before = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(before).toHaveLength(1)
    const reservedLocation = before[0].location

    const claimed = await claimReserve(ctx.repoId, "feat/test-branch", "main")
    expect(claimed).toEqual({ location: reservedLocation })

    // The original row is removed immediately; a background refill may or may
    // not have completed by the time we read. Either 0 or 1 is correct as long
    // as the original entry id is gone.
    const after = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    const stillThere = after.find((r) => r.id === before[0].id)
    expect(stillThere).toBeUndefined()
  })

  it("returns null when no reserve exists", async () => {
    ctx = setup({ setupScript: null })

    const claimed = await claimReserve(ctx.repoId, "feat/no-reserve", "main")
    expect(claimed).toBeNull()
  })
})
