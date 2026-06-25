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
import { createWorktree } from "./worktrees.js"
import { ensureReserve, claimReserve, initializeReserves, HEAVY_RESERVE_COUNT } from "./pool.js"

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

  it("builds the deeper pool for a repo with a setup script (and runs it in each)", async () => {
    // A repo with a setup script is "heavy", so it gets HEAVY_RESERVE_COUNT
    // reserves. The marker file proves the spawn path runs in every one.
    ctx = setup({ setupScript: "touch ./.setup-ran" })

    await ensureReserve(ctx.repoId)

    const rows = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(rows).toHaveLength(HEAVY_RESERVE_COUNT)
    for (const row of rows) {
      expect(existsSync(path.join(ctx.workspacesPath, row.location, ".setup-ran"))).toBe(true)
    }
  })

  it("tops up a partially-filled deeper pool to the target", async () => {
    ctx = setup({ setupScript: "true" })

    await ensureReserve(ctx.repoId)
    expect(
      ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all(),
    ).toHaveLength(HEAVY_RESERVE_COUNT)

    // Drop one row to simulate a claim, then ensure refills back to target.
    const first = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()[0]
    ctx.testDb.db.delete(worktreePool).where(eq(worktreePool.id, first.id)).run()

    await ensureReserve(ctx.repoId)
    expect(
      ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all(),
    ).toHaveLength(HEAVY_RESERVE_COUNT)
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

  it("removes orphaned pool worktrees (pool/pool-* on disk, untracked in the DB) and rebuilds", async () => {
    ctx = setup({ setupScript: null })

    // An orphan: a reserve worktree on disk with no matching DB row, left
    // behind when a reserve build is interrupted before recording its row.
    const orphanPath = path.join(ctx.workspacesPath, "pool-orphan")
    await createWorktree(ctx.repo.path, "pool/pool-orphan", orphanPath, "main")
    expect(existsSync(orphanPath)).toBe(true)

    await initializeReserves()

    // The orphan is gone, and a fresh tracked reserve exists in its place.
    expect(existsSync(orphanPath)).toBe(false)
    const rows = ctx.testDb.db.select().from(worktreePool).where(eq(worktreePool.repoId, ctx.repoId)).all()
    expect(rows).toHaveLength(1)
    expect(rows.find((r) => r.location === "pool-orphan")).toBeUndefined()
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
