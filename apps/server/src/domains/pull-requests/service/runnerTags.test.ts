import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { createTestDb, silenceLogs, type TestDb, type SilencedLogs } from "../../../../test/harness.js"
import { prReplyHandler, wantsResolve } from "./runnerTags.js"
import { findReviewThreadForComment, replyToReviewComment, resolveReviewThread } from "../prComments.js"

vi.mock("../prComments.js", () => ({
  replyToReviewComment: vi.fn(),
  findReviewThreadForComment: vi.fn(),
  resolveReviewThread: vi.fn(),
}))
import type { TagOutcome } from "../../agent-runner/agent-runner.types.js"

// The pr.reply handler posts to GitHub via Octokit on the happy path (network,
// not exercised here). These tests cover every PRECONDITION failure: each must
// return a follow-up so the agent learns the reply did not post instead of the
// old silent no-op that left the agent believing it replied.

const AGENT_ID = "agent-prr-1"
const REPO_ID = "repo-prr-1"

interface Ctx {
  testDb: TestDb
  logs: SilencedLogs
}

function insertRepo(db: TestDb["db"], name: string): void {
  const now = new Date().toISOString()
  db.insert(reposTable).values({
    id: REPO_ID, name, path: "/tmp/x", workspacesPath: "/tmp/x/w",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
}

function insertAgent(db: TestDb["db"], fields: { repoId?: string | null; prNumber?: number | null }): void {
  const now = new Date().toISOString()
  db.insert(agentsTable).values({
    id: AGENT_ID, repoId: fields.repoId ?? null, prNumber: fields.prNumber ?? null,
    title: "T", status: "in-progress", branch: "b", model: "Sonnet 4.6",
    location: "loc", provider: "claude", streaming: 0, createdAt: now, updatedAt: now,
  }).run()
}

async function invoke(commentId = "123", body = "fixed it", resolve?: string): Promise<TagOutcome | void> {
  const handler = prReplyHandler(AGENT_ID)
  return handler.onTag({ args: { commentId, resolve }, body })
}

describe("prReplyHandler follow-ups", () => {
  let ctx: Ctx
  beforeEach(() => { ctx = { logs: silenceLogs(), testDb: createTestDb() } })
  afterEach(() => { ctx.testDb.close(); ctx.logs.restore() })

  it("returns a follow-up when the workspace has no linked repo", async () => {
    insertAgent(ctx.testDb.db, { repoId: null })
    const outcome = await invoke()
    expect(outcome?.followUp?.sender).toBe("PR Reply")
    expect(outcome?.followUp?.content).toContain("no linked repo")
    expect(outcome?.followUp?.content).toContain("gh api")
  })

  // Note: the "repoId set but repo row missing" guard in the handler is
  // defensive only — foreign-key enforcement makes that state unreachable, so
  // it has no test.

  it("returns a follow-up when the workspace has no linked PR", async () => {
    insertRepo(ctx.testDb.db, "owner/repo")
    insertAgent(ctx.testDb.db, { repoId: REPO_ID, prNumber: null })
    const outcome = await invoke()
    expect(outcome?.followUp?.content).toContain("no linked PR")
  })

  it("returns a follow-up when the repo name can't be split into owner/repo", async () => {
    insertRepo(ctx.testDb.db, "just-a-name")
    insertAgent(ctx.testDb.db, { repoId: REPO_ID, prNumber: 7 })
    const outcome = await invoke()
    expect(outcome?.followUp?.content).toContain("owner/repo")
  })

  it("returns a follow-up when the comment id is not numeric", async () => {
    insertRepo(ctx.testDb.db, "owner/repo")
    insertAgent(ctx.testDb.db, { repoId: REPO_ID, prNumber: 7 })
    const outcome = await invoke("not-a-number")
    expect(outcome?.followUp?.content).toContain("not a valid numeric comment id")
    // The failing id is echoed so the agent knows which reply to retry.
    expect(outcome?.followUp?.content).toContain("not-a-number")
  })
})

describe("prReplyHandler resolve", () => {
  let ctx: Ctx
  beforeEach(() => {
    ctx = { logs: silenceLogs(), testDb: createTestDb() }
    vi.mocked(replyToReviewComment).mockReset().mockResolvedValue("thread")
    vi.mocked(findReviewThreadForComment).mockReset().mockResolvedValue({ id: "T_1", isResolved: false })
    vi.mocked(resolveReviewThread).mockReset().mockResolvedValue()
    insertRepo(ctx.testDb.db, "owner/repo")
    insertAgent(ctx.testDb.db, { repoId: REPO_ID, prNumber: 7 })
  })
  afterEach(() => { ctx.testDb.close(); ctx.logs.restore() })

  it("resolves the thread after replying when resolve=\"true\"", async () => {
    const outcome = await invoke("123", "fixed it", "true")
    expect(outcome).toBeUndefined()
    expect(findReviewThreadForComment).toHaveBeenCalledWith("owner", "repo", 7, 123)
    expect(resolveReviewThread).toHaveBeenCalledWith("T_1")
  })

  it("leaves the thread open without resolve", async () => {
    await invoke("123", "I don't think so, because...")
    expect(replyToReviewComment).toHaveBeenCalled()
    expect(findReviewThreadForComment).not.toHaveBeenCalled()
    expect(resolveReviewThread).not.toHaveBeenCalled()
  })

  it("ignores resolve when the reply landed as a conversation comment", async () => {
    vi.mocked(replyToReviewComment).mockResolvedValue("conversation")
    await invoke("123", "fixed it", "true")
    expect(findReviewThreadForComment).not.toHaveBeenCalled()
  })

  it("does not resolve a thread that is already resolved", async () => {
    vi.mocked(findReviewThreadForComment).mockResolvedValue({ id: "T_1", isResolved: true })
    await invoke("123", "fixed it", "true")
    expect(resolveReviewThread).not.toHaveBeenCalled()
  })

  it("tells the agent when resolving fails, without asking it to re-post", async () => {
    vi.mocked(resolveReviewThread).mockRejectedValue(new Error("Resource not accessible"))
    const outcome = await invoke("123", "fixed it", "true")
    expect(outcome?.followUp?.content).toContain("was posted")
    expect(outcome?.followUp?.content).toContain("NOT resolved")
    expect(outcome?.followUp?.content).toContain("resolveReviewThread")
  })

  it("tells the agent when no thread holds the comment", async () => {
    vi.mocked(findReviewThreadForComment).mockResolvedValue(null)
    const outcome = await invoke("123", "fixed it", "true")
    expect(outcome?.followUp?.content).toContain("no review thread")
  })
})

describe("wantsResolve", () => {
  it("accepts true/yes/1 in any case", () => {
    for (const v of ["true", "TRUE", " yes ", "1"]) expect(wantsResolve(v)).toBe(true)
    for (const v of [undefined, "", "false", "no", "0"]) expect(wantsResolve(v)).toBe(false)
  })
})
