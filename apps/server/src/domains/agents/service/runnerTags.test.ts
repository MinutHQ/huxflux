/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import {
  agents as agentsTable, repos as reposTable, toolCalls as toolCallsTable,
  terminalTabs as terminalTabsTable, terminalLines as terminalLinesTable, messages as messagesTable,
} from "../../../db/schema.js"
import {
  createTestDb, createGitTmpRepo, captureWsEvents, silenceLogs, waitFor,
  type TestDb, type GitTmpRepo, type CapturedWsEvents, type SilencedLogs,
} from "../../../../test/harness.js"
import { DATA_DIR } from "../../../config.js"
import { registerProvider, _resetProviders } from "../../providers/registry.js"
import type { ProviderAdapter } from "../../providers/providers.types.js"
import type { TagHandler, TagOutcome } from "../../agent-runner/agent-runner.types.js"
import { agentSpawnHandler } from "./runnerTags.js"

// Mirrors the Claude provider's stream format so the runner's claude-format
// branch parses the fake output line-by-line (same technique as the
// agent-runner E2E tests: real runner, fake provider binary).
const __filename = fileURLToPath(import.meta.url)
const SERVER_ROOT = path.resolve(path.dirname(__filename), "..", "..", "..", "..")
const FAKE_BIN = path.join(SERVER_ROOT, "test", "fixtures", "fake-claude.mjs")
const FIXTURE_DIR = path.join(SERVER_ROOT, "test", "fixtures", "streams")

function makeTestProvider(fixturePath: string): ProviderAdapter {
  // Adapter id stays "claude" (the runner branches on `provider.id ===
  // "claude"` for the stream-json format) while the registry key is
  // "test-provider" — same trick as the agent-runner E2E tests.
  return {
    id: "claude",
    name: "Test Claude",
    capabilities: {
      sessionResume: false, sessionContinue: false, planMode: false, streamingJson: true,
      toolUseEvents: true, thinkingBlocks: true, askUserQuestion: false,
      systemPromptFlag: true, allowedToolsRestriction: false, subAgentSupport: false,
      effortLevels: [],
    },
    resolveBinary: () => process.execPath,
    isAvailable: () => true,
    buildSpawnArgs: () => ({
      bin: process.execPath,
      args: [FAKE_BIN],
      env: { HUXFLUX_FAKE_FIXTURE: fixturePath, HUXFLUX_FAKE_DELAY_MS: "1" },
    }),
    parseStreamLine: () => null,
    resolveModel: (m) => m || "claude-sonnet-4-6",
    getModels: () => [],
  }
}

const PARENT_ID = "parent-agent"
const NOW = new Date().toISOString()

interface Ctx {
  logs: SilencedLogs
  testDb: TestDb
  capture: CapturedWsEvents
  repos: { A: GitTmpRepo; B: GitTmpRepo; B2: GitTmpRepo; Folder: GitTmpRepo }
  ws: { A: string; B: string; B2: string; Folder: string }
  repoRows: { A: string; B: string; B2: string; Folder: string }
  cleanup: () => void
}

function insertRepo(testDb: TestDb, values: {
  id: string; name: string; path: string; workspacesPath: string;
  type?: string; setupScript?: string | null
}): void {
  testDb.db.insert(reposTable).values({
    id: values.id,
    name: values.name,
    path: values.path,
    workspacesPath: values.workspacesPath,
    branchFrom: "main",
    remote: "origin",
    type: values.type ?? "git",
    setupScript: values.setupScript ?? null,
    createdAt: NOW,
  }).run()
}

function setup(opts: { BSetupScript?: string; B2SetupScript?: string } = {}): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const repos = {
    A: createGitTmpRepo(),
    B: createGitTmpRepo(),
    B2: createGitTmpRepo(),
    Folder: { path: mkdtempSync(path.join(tmpdir(), "huxflux-test-folder-")), cleanup: () => { try { rmSync(repos.Folder.path, { recursive: true, force: true }) } catch { /* gone */ } } },
  }
  const ws = {
    A: path.join(repos.A.path, ".workspaces"),
    B: path.join(repos.B.path, ".workspaces"),
    B2: path.join(repos.B2.path, ".workspaces"),
    Folder: repos.Folder.path,
  }
  insertRepo(testDb, { id: "repo-a", name: "owner/A", path: repos.A.path, workspacesPath: ws.A })
  insertRepo(testDb, { id: "repo-b", name: "owner/B", path: repos.B.path, workspacesPath: ws.B })
  insertRepo(testDb, { id: "repo-b2", name: "owner/B2", path: repos.B2.path, workspacesPath: ws.B2, setupScript: opts.B2SetupScript })
  insertRepo(testDb, { id: "repo-folder", name: "docs-folder", path: repos.Folder.path, workspacesPath: ws.Folder, type: "folder" })
  testDb.db.insert(agentsTable).values({
    id: PARENT_ID, repoId: "repo-a", title: "Parent Agent", status: "in-progress",
    branch: "main", model: "Sonnet 4.6", location: "loc", provider: "test-provider",
    createdAt: NOW, updatedAt: NOW,
  }).run()
  const capture = captureWsEvents([PARENT_ID])
  return {
    logs, testDb, capture, repos, ws,
    repoRows: { A: "repo-a", B: "repo-b", B2: "repo-b2", Folder: "repo-folder" },
    cleanup: () => {
      capture.restore()
      repos.A.cleanup()
      repos.B.cleanup()
      repos.B2.cleanup()
      repos.Folder.cleanup()
      testDb.close()
      logs.restore()
    },
  }
}

// Call a tag handler's onTag the way the runner's dispatcher would (args are
// already parsed by tagParser in production; tests hand them in directly).
async function callTag(handler: TagHandler, args: Record<string, string>, body: string): Promise<TagOutcome | void> {
  return (handler.onTag as (e: { args: Record<string, string>; body: string }) => Promise<TagOutcome | void>)({ args, body })
}

function findThreadChild(ctx: Ctx, parentAgentId: string): any {
  return ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.threadParentId, parentAgentId)).get()
}

/**
 * Wait until the seeded first turn of the spawned agent has fully finalized.
 * Cleaning up before that leaks the old turn into the next test's fresh DB
 * (FK failures on the old agent id).
 *
 * This waits on the turn's terminal state, not on the streaming flag's 1 -> 0
 * edge. Polling for the edge means the wait only succeeds if a poll happens to
 * land while the turn is in flight, so a turn that finished before the first
 * poll hangs until the timeout. Callers that first wait for the assistant
 * message hit exactly that, because finalize persists the message and then
 * clears the flag. A finished turn is instead identified by both facts
 * together: the flag is off AND the turn's message has landed, which is false
 * before the turn starts and stays true afterwards.
 */
async function awaitTurn(ctx: Ctx, agentId: string): Promise<void> {
  await waitFor(() => {
    const agent: any = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    if (agent?.streaming !== 0) return false
    return ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, agentId)).all()
      .some((m: any) => m.role === "assistant")
  }, { timeoutMs: 10_000 })
}

describe("agents.spawn (thread agents)", () => {
  let ctx: Ctx

  beforeEach(() => {
    _resetProviders()
    ctx = setup()
    registerProvider("test-provider", makeTestProvider(path.join(FIXTURE_DIR, "happy-path.json")))
  })

  afterEach(() => {
    ctx.cleanup()
    _resetProviders()
  })

  it("spawns a thread agent in a different repo, addressed by name", async () => {
    const handler = agentSpawnHandler(PARENT_ID)
    const outcome = (await callTag(handler, { repo: "owner/B" }, "Fix the B bug")) as TagOutcome
    expect(outcome.followUp?.content).toContain('Thread agent "Fix the B bug" spawned in "owner/B"')

    const child = findThreadChild(ctx, PARENT_ID)
    expect(child).toBeDefined()
    expect(child.repoId).toBe(ctx.repoRows.B)
    expect(child.title).toBe("Fix the B bug")
    // location and branch derive from the same sanitized slug, so the
    // bootstrap's worktree reconciliation is a no-op and the folder stays put
    expect(child.branch).toBe(`thread-fix-the-b-bug-${child.id.slice(0, 6)}`)
    expect(child.location).toBe(child.branch)
    expect(child.status).toBe("in-progress")

    // parity with the REST create path: fresh worktree + default t1 terminal tab
    const worktreePath = path.join(ctx.ws.B, child.location)
    expect(existsSync(worktreePath)).toBe(true)
    const tab = ctx.testDb.db.select().from(terminalTabsTable).where(eq(terminalTabsTable.agentId, child.id)).get()
    expect(tab).toBeDefined()
    expect(tab.terminalId).toBe("t1")

    // the seeded first message is queued in-process and actually starts a turn
    const seeded = await waitFor(
      () => ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, child.id)).all()
        .find((m: any) => m.role === "user" && m.content.includes("Fix the B bug")),
      { timeoutMs: 10_000 },
    )
    expect(seeded.content).toContain(`You were spawned by "Parent Agent" (main) to handle cross-repo work.`)
    expect(seeded.content).toContain("<huxflux:agents.delegate agent=\"parent-agent\">")
    expect(seeded.sender).toBe("Parent Agent")
    // The seeded turn completes. For claude turns the persisted assistant
    // message holds only the text after the LAST tool call (pre-tool text
    // lives in toolCalls[].precedingText), so assert on that tail.
    const reply = await waitFor(
      () => ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, child.id)).all()
        .find((m: any) => m.role === "assistant" && !!m.content && m.content.includes("All done.")),
      { timeoutMs: 10_000 },
    )
    expect(reply.content).toContain("All done.")
    // the pre-tool text is preserved on the tool call for inline display
    const toolCall = ctx.testDb.db.select().from(toolCallsTable).where(eq(toolCallsTable.messageId, reply.id)).get()
    expect(toolCall?.precedingText).toBe("Hello world.")
    await awaitTurn(ctx, child.id)

    // WS: the new agent is broadcast to subscribers
    expect(ctx.capture.events.some((e) => (e as any).type === "agent:updated")).toBe(true)
  })

  it("spawns a thread agent addressed by repoId", async () => {
    const handler = agentSpawnHandler(PARENT_ID)
    const outcome = (await callTag(handler, { repoId: ctx.repoRows.B }, "Fix the B bug")) as TagOutcome
    expect(outcome.followUp?.content).toContain(`spawned in "${ctx.repoRows.B}"`)
    expect(outcome.followUp?.content).toContain("will start working on it immediately")

    const child = findThreadChild(ctx, PARENT_ID)
    expect(child).toBeDefined()
    expect(child.repoId).toBe(ctx.repoRows.B)

    const seeded = await waitFor(
      () => ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, child.id)).all()
        .find((m: any) => m.role === "user" && m.content.includes("Fix the B bug")),
      { timeoutMs: 10_000 },
    )
    expect(seeded).toBeDefined()
    await awaitTurn(ctx, child.id)
  })

  it("rejects an unknown repo with a followUp and inserts no agent row", async () => {
    const handler = agentSpawnHandler(PARENT_ID)
    const outcome = (await callTag(handler, { repo: "owner/Nope" }, "Fix the B bug")) as TagOutcome
    expect(outcome.followUp?.content).toBe('Thread agent spawn failed: Unknown repo: "owner/Nope"')
    expect(findThreadChild(ctx, PARENT_ID)).toBeUndefined()
    expect(ctx.testDb.db.select({ id: agentsTable.id }).from(agentsTable).all()).toHaveLength(1)
  })

  it("rejects folder repos with a followUp and never attempts a worktree", async () => {
    const handler = agentSpawnHandler(PARENT_ID)
    const outcome = (await callTag(handler, { repo: "docs-folder" }, "Fix the B bug")) as TagOutcome
    expect(outcome.followUp?.content).toContain("is a folder, not a git repo")
    expect(findThreadChild(ctx, PARENT_ID)).toBeUndefined()
    expect(existsSync(path.join(ctx.repos.Folder.path, ".workspaces"))).toBe(false)
  })

  it("reports a followUp when threadsEnabled is disabled", async () => {
    const settingsFile = path.join(DATA_DIR, "settings.json")
    const prev = existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : null
    writeFileSync(settingsFile, JSON.stringify({ threadsEnabled: false }))
    try {
      const handler = agentSpawnHandler(PARENT_ID)
      const outcome = (await callTag(handler, { repo: "owner/B" }, "Fix the B bug")) as TagOutcome
      expect(outcome.followUp?.content).toContain("Cross-repo threads are disabled in settings")
      expect(findThreadChild(ctx, PARENT_ID)).toBeUndefined()
    } finally {
      if (prev === null) rmSync(settingsFile, { force: true })
      else writeFileSync(settingsFile, prev)
    }
  })

  it("gives two spawns of the same task text distinct branches (collision-proof)", async () => {
    const handler = agentSpawnHandler(PARENT_ID)
    const first = (await callTag(handler, { repo: "owner/B" }, "Fix the B bug")) as TagOutcome
    expect(first.followUp?.content).toContain("spawned")
    const second = (await callTag(handler, { repo: "owner/B" }, "Fix the B bug")) as TagOutcome
    expect(second.followUp?.content).toContain("spawned")

    const children = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.threadParentId, PARENT_ID)).all()
    expect(children).toHaveLength(2)
    const [a, b] = children
    expect(a.branch).not.toBe(b.branch)
    expect(a.branch).toBe(`thread-fix-the-b-bug-${a.id.slice(0, 6)}`)
    expect(b.branch).toBe(`thread-fix-the-b-bug-${b.id.slice(0, 6)}`)
    // both worktrees exist on disk with distinct, slug-derived locations
    for (const c of children as any[]) {
      expect(c.location).toBe(c.branch)
      expect(existsSync(path.join(ctx.ws.B, c.location))).toBe(true)
    }
    // wait for both seeded turns to land
    for (const c of children as any[]) {
      await waitFor(
        () => ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, c.id)).all()
          .find((m: any) => m.role === "assistant" && m.content && m.content.includes("All done.")),
        { timeoutMs: 10_000 },
      )
    }
    for (const c of children as any[]) {
      await awaitTurn(ctx, c.id)
    }
  })

  it("reports a followUp when no repo attribute is given", async () => {
    const handler = agentSpawnHandler(PARENT_ID)
    const outcome = (await callTag(handler, {}, "Fix the B bug")) as TagOutcome
    expect(outcome.followUp?.content).toContain("No target repo given")
    expect(findThreadChild(ctx, PARENT_ID)).toBeUndefined()
  })
})

describe("agents.spawn with a repo setup script", () => {
  let ctx: Ctx

  function setupWithScript(script: string): void {
    _resetProviders()
    ctx = setup({ B2SetupScript: script })
    registerProvider("test-provider", makeTestProvider(path.join(FIXTURE_DIR, "happy-path.json")))
  }

  afterEach(() => {
    ctx.cleanup()
    _resetProviders()
  })

  it("streams a passing setup script to the agent's terminal lines", async () => {
    setupWithScript("echo 'installing deps'")
    const handler = agentSpawnHandler(PARENT_ID)
    const outcome = (await callTag(handler, { repo: "owner/B2" }, "Fix the B2 bug")) as TagOutcome
    expect(outcome.followUp?.content).toContain("spawned")
    const child = findThreadChild(ctx, PARENT_ID)
    expect(child).toBeDefined()
    const lines = ctx.testDb.db.select().from(terminalLinesTable).where(eq(terminalLinesTable.agentId, child.id)).all()
    expect(lines.map((l: any) => l.line)).toContain("installing deps")
    await awaitTurn(ctx, child.id)
  })

  it("rolls back the spawn when the setup script fails", async () => {
    setupWithScript("exit 1")
    const handler = agentSpawnHandler(PARENT_ID)
    const outcome = (await callTag(handler, { repo: "owner/B2" }, "Fix the B2 bug")) as TagOutcome
    expect(outcome.followUp?.content).toBe("Thread agent spawn failed: Setup script failed: Setup script exited with code 1")
    // agent row rolled back, worktree removed, no seeded message
    expect(findThreadChild(ctx, PARENT_ID)).toBeUndefined()
    const rows = ctx.testDb.db.select().from(agentsTable).all()
    expect(rows).toHaveLength(1)
  })
})
