import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { agents as agentsTable, messages as messagesTable, repos as reposTable } from "../../../db/schema.js"
import {
  createTestDb, captureWsEvents, silenceLogs, waitFor,
  type TestDb, type CapturedWsEvents, type SilencedLogs,
} from "../../../../test/harness.js"
import { registerProvider, _resetProviders } from "../../providers/registry.js"
import type { ProviderAdapter } from "../../providers/providers.types.js"
import { runAgent } from "../agent-runner.service.js"
import { resolveModelAlias, runningProcesses, stopAllRunningTurns, stopAgent, takeStopReason } from "./processRegistry.js"

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
const FAKE_BIN = path.join(SERVER_ROOT, "test", "fixtures", "fake-claude.mjs")
const SLOW_FIXTURE = path.join(SERVER_ROOT, "test", "fixtures", "streams", "slow-stream.json")

// Claude-format test provider driving the fake binary with a long per-event
// delay, so the turn is still running when the shutdown path stops it.
function makeSlowProvider(): ProviderAdapter {
  return {
    id: "claude",
    name: "Slow Test Claude",
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
      env: { HUXFLUX_FAKE_FIXTURE: SLOW_FIXTURE, HUXFLUX_FAKE_DELAY_MS: "400" },
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
  const agentId = "agent-stop-1"
  const repoId = "repo-stop-1"
  const now = new Date().toISOString()
  testDb.db.insert(reposTable).values({
    id: repoId, name: "owner/repo", path: "/tmp/no-such",
    workspacesPath: "/tmp/no-such/.workspaces",
    branchFrom: "origin/main", remote: "origin", createdAt: now,
  }).run()
  testDb.db.insert(agentsTable).values({
    id: agentId, repoId, title: "Stoppable", status: "in-progress",
    branch: "wip/stop", model: "Sonnet 4.6", location: "loc",
    provider: "slow-provider", createdAt: now, updatedAt: now,
  }).run()
  const capture = captureWsEvents([agentId])
  return { testDb, capture, logs, agentId }
}

describe("stopAllRunningTurns", () => {
  let ctx: Ctx
  beforeEach(() => {
    ctx = setup()
    registerProvider("slow-provider", makeSlowProvider())
  })
  afterEach(() => {
    _resetProviders()
    ctx.capture.restore()
    ctx.testDb.close()
    ctx.logs.restore()
  })

  it("returns 0 and resolves immediately when nothing is running", async () => {
    expect(await stopAllRunningTurns("test", 1000)).toBe(0)
  })

  it("stops a running turn, persists the partial text with an interrupted note, and waits for finalize", async () => {
    const turn = runAgent("go", { agentId: ctx.agentId, worktreePath: "/tmp/no-such-worktree", model: "Sonnet 4.6", provider: "slow-provider" })
    await waitFor(() => runningProcesses.has(ctx.agentId), { timeoutMs: 5000 })
    // Let at least one text chunk stream in before stopping.
    await waitFor(() => ctx.capture.events.some((e) => e.type === "message:chunk"), { timeoutMs: 5000 })

    const stopped = await stopAllRunningTurns("the Huxflux server was restarting", 5000)
    expect(stopped).toBe(1)
    // Finalize has already run by the time the drain resolves.
    expect(runningProcesses.has(ctx.agentId)).toBe(false)

    const agent = ctx.testDb.db.select().from(agentsTable).where(eq(agentsTable.id, ctx.agentId)).get()
    expect(agent?.streaming).toBe(0)

    const msg = ctx.testDb.db.select().from(messagesTable)
      .where(eq(messagesTable.agentId, ctx.agentId)).all()
      .find((m) => m.role === "assistant")
    expect(msg).toBeDefined()
    expect(msg!.durationMs).not.toBeNull()
    expect(msg!.content).toContain("Working on it")
    expect(msg!.content).toContain("*Turn interrupted: the Huxflux server was restarting. Send a message to continue.*")

    const done = ctx.capture.events.find((e) => e.type === "message:done")
    expect(done).toBeDefined()
    expect((done as { message: { content: string } }).message.content).toContain("Turn interrupted")
    // The stop reason is consumed exactly once.
    expect(takeStopReason(ctx.agentId)).toBeUndefined()
    await turn
  })

  it("a plain user stop leaves no interrupted note", async () => {
    const turn = runAgent("go", { agentId: ctx.agentId, worktreePath: "/tmp/no-such-worktree", model: "Sonnet 4.6", provider: "slow-provider" })
    await waitFor(() => ctx.capture.events.some((e) => e.type === "message:chunk"), { timeoutMs: 5000 })
    expect(stopAgent(ctx.agentId)).toBe(true)
    await turn
    const msg = ctx.testDb.db.select().from(messagesTable)
      .where(eq(messagesTable.agentId, ctx.agentId)).all()
      .find((m) => m.role === "assistant")
    expect(msg!.content).not.toContain("Turn interrupted")
    expect(msg!.durationMs).not.toBeNull()
  })
})

describe("resolveModelAlias", () => {
  it("returns the fallback when model is undefined", () => {
    expect(resolveModelAlias(undefined)).toBe("claude-sonnet-4-6")
    expect(resolveModelAlias(undefined, "claude-opus-4-7")).toBe("claude-opus-4-7")
  })

  it("returns an API id unchanged", () => {
    expect(resolveModelAlias("claude-opus-4-6")).toBe("claude-opus-4-6")
    expect(resolveModelAlias("claude-haiku-4-5")).toBe("claude-haiku-4-5")
  })

  it("translates known display names to API ids", () => {
    expect(resolveModelAlias("Sonnet 4.6")).toBe("claude-sonnet-4-6")
    expect(resolveModelAlias("Opus 4.7")).toBe("claude-opus-4-7")
    expect(resolveModelAlias("Opus 4.6")).toBe("claude-opus-4-6")
    expect(resolveModelAlias("Haiku 4.5")).toBe("claude-haiku-4-5")
  })

  it("falls back when the display name is unknown", () => {
    expect(resolveModelAlias("Mystery 9.9")).toBe("claude-sonnet-4-6")
    expect(resolveModelAlias("Mystery 9.9", "claude-opus-4-7")).toBe("claude-opus-4-7")
  })

  it("treats the empty string as missing (returns the fallback)", () => {
    expect(resolveModelAlias("")).toBe("claude-sonnet-4-6")
  })
})
