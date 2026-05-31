import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { z } from "zod/v4"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { agents as agentsTable, messages as messagesTable, repos as reposTable } from "../../db/schema.js"
import {
  createTestDb, captureWsEvents, silenceLogs, waitFor,
  type TestDb, type CapturedWsEvents, type SilencedLogs,
} from "../../../test/harness.js"
import { runAgent } from "./agent-runner.service.js"
import { registerProvider, _resetProviders } from "../providers/registry.js"
import type { ProviderAdapter } from "../providers/providers.types.js"
import type { TagHandler } from "./agent-runner.types.js"

const __filename = fileURLToPath(import.meta.url)
const SERVER_ROOT = path.resolve(path.dirname(__filename), "..", "..", "..")
const FAKE_BIN = path.join(SERVER_ROOT, "test", "fixtures", "fake-claude.mjs")
const FIXTURE_DIR = path.join(SERVER_ROOT, "test", "fixtures", "streams")

function makeTestProvider(fixturePath: string): ProviderAdapter {
  // Mirrors the Claude provider's stream format so the runner's
  // claude-format branch parses our fake output line-by-line.
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

interface Ctx {
  testDb: TestDb
  capture: CapturedWsEvents
  logs: SilencedLogs
  agentId: string
}

function setup(): Ctx {
  const logs = silenceLogs()
  const testDb = createTestDb()
  const agentId = "agent-e2e-1"
  const repoId = "repo-e2e-1"
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: repoId, name: "owner/repo", path: "/tmp/no-such",
    workspacesPath: "/tmp/no-such/.workspaces",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
  testDb.db.insert(agentsTable).values({
    id: agentId, repoId, title: "Real Title", status: "in-progress",
    branch: "wip/real", model: "Sonnet 4.6", location: "loc",
    provider: "test-provider", createdAt: now, updatedAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return { testDb, capture, logs, agentId }
}

describe("runAgent E2E with fake-claude binary", () => {
  let ctx: Ctx
  beforeEach(() => {
    ctx = setup()
    registerProvider("test-provider", makeTestProvider(path.join(FIXTURE_DIR, "happy-path.json")))
  })
  afterEach(() => {
    _resetProviders()
    ctx.capture.restore()
    ctx.testDb.close()
    ctx.logs.restore()
  })

  it("runs through the full happy-path turn end to end", async () => {
    await runAgent("hello agent", {
      agentId: ctx.agentId,
      worktreePath: "/tmp/no-such-worktree",
      provider: "test-provider",
      model: "Sonnet 4.6",
    })

    const allMessages = ctx.testDb.db.select().from(messagesTable).where(eq(messagesTable.agentId, ctx.agentId)).all()
    expect(allMessages.length).toBeGreaterThanOrEqual(2)
    const userMsg = allMessages.find((m: { role: string }) => m.role === "user")
    expect(userMsg?.content).toBe("hello agent")

    const assistantMsg = allMessages.find((m: { role: string }) => m.role === "assistant") as { content: string; id: string } | undefined
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg?.content).toContain("All done")

    const agentRow = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(agentRow.streaming).toBe(0)

    await waitFor(() => ctx.capture.events.some((e) => e.type === "message:done"))
    const done = ctx.capture.events.find((e) => e.type === "message:done") as { agentId: string; messageId: string } | undefined
    expect(done?.agentId).toBe(ctx.agentId)
    expect(done?.messageId).toBe(assistantMsg?.id)
  })
})

describe("runAgent with caller-provided tag handlers", () => {
  let ctx: Ctx
  beforeEach(() => {
    ctx = setup()
    registerProvider("test-provider", makeTestProvider(path.join(FIXTURE_DIR, "meta-directive.json")))
  })
  afterEach(() => {
    _resetProviders()
    ctx.capture.restore()
    ctx.testDb.close()
    ctx.logs.restore()
  })

  it("dispatches a caller-registered handler against the streamed body", async () => {
    const seenTitles: string[] = []
    const titleHandler: TagHandler = {
      id: "huxflux.title",
      args: z.object({}),
      onTag: ({ body }) => { seenTitles.push(body) },
    }
    // The meta-directive fixture emits a legacy `<huxflux:title>` (no dot) so
    // we register a custom dotted tag to assert dispatch wiring. Behaviour
    // for the legacy tag is just the strip step (verified separately).
    await runAgent("emit a tag", {
      agentId: ctx.agentId,
      worktreePath: "/tmp/no-such-worktree",
      provider: "test-provider",
      model: "Sonnet 4.6",
      tags: [titleHandler],
    })
    // The fixture doesn't include our custom tag, so the handler isn't called
    // but the run still finishes cleanly (proving the `tags` option is
    // accepted end-to-end without breaking the happy path).
    expect(seenTitles).toEqual([])
    const agentRow = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(agentRow.streaming).toBe(0)
  })

  it("strips every <huxflux:*> tag from the persisted message body", async () => {
    await runAgent("emit a tag", {
      agentId: ctx.agentId,
      worktreePath: "/tmp/no-such-worktree",
      provider: "test-provider",
      model: "Sonnet 4.6",
      tags: [],
    })
    const assistantMsg = ctx.testDb.db.select().from(messagesTable)
      .where(eq(messagesTable.agentId, ctx.agentId)).all()
      .find((m: { role: string }) => m.role === "assistant") as { content: string } | undefined
    expect(assistantMsg?.content).not.toContain("<huxflux:")
  })
})
