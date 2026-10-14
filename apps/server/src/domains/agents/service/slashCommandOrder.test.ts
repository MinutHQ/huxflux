import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { agents as agentsTable, messages as messagesTable, repos as reposTable } from "../../../db/schema.js"
import { createTestDb, silenceLogs, type TestDb, type SilencedLogs } from "../../../../test/harness.js"
import type { SlashCommand } from "../agents.types.js"
import { extractCommandNames, loadRecentCommandNames, orderCommandsByRecency } from "./slashCommandOrder.js"

const AGENT_ID = "agent-slash-1"

function cmd(name: string): SlashCommand {
  return { name, description: `desc ${name}`, source: "skill" }
}

function names(commands: SlashCommand[]): string[] {
  return commands.map((c) => c.name)
}

describe("extractCommandNames", () => {
  it("finds a command at the start of the message", () => {
    expect(extractCommandNames("/review please")).toEqual(["review"])
  })

  it("finds a command on a later line after prepended context", () => {
    expect(extractCommandNames("PR review comments:\n\n> hi\n\n---\n\n/fix the lint")).toEqual(["fix"])
  })

  it("accepts plugin-style names with colons and dashes", () => {
    expect(extractCommandNames("/code-review:code-review")).toEqual(["code-review:code-review"])
  })

  it("ignores absolute paths and slashes mid-line", () => {
    expect(extractCommandNames("/Users/me/file.ts\nsee a/b and /c/d")).toEqual([])
  })

  it("returns nothing for plain text", () => {
    expect(extractCommandNames("hello there")).toEqual([])
  })
})

describe("orderCommandsByRecency", () => {
  const all = ["delta", "alpha", "foxtrot", "charlie", "echo", "bravo", "golf"].map(cmd)

  it("sorts alphabetically when nothing was used", () => {
    expect(names(orderCommandsByRecency(all, []))).toEqual(
      ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"],
    )
  })

  it("puts recent commands first in recency order, then the rest alphabetically", () => {
    expect(names(orderCommandsByRecency(all, ["echo", "alpha"]))).toEqual(
      ["echo", "alpha", "bravo", "charlie", "delta", "foxtrot", "golf"],
    )
  })

  it("caps the recent section at five", () => {
    const recent = ["golf", "foxtrot", "echo", "delta", "charlie", "bravo"]
    expect(names(orderCommandsByRecency(all, recent))).toEqual(
      ["golf", "foxtrot", "echo", "delta", "charlie", "alpha", "bravo"],
    )
  })

  it("skips recent names that are not available and still fills five slots", () => {
    const recent = ["gone", "golf", "missing", "foxtrot", "echo", "delta", "charlie", "bravo"]
    expect(names(orderCommandsByRecency(all, recent))).toEqual(
      ["golf", "foxtrot", "echo", "delta", "charlie", "alpha", "bravo"],
    )
  })
})

describe("loadRecentCommandNames", () => {
  let testDb: TestDb
  let logs: SilencedLogs
  let seq = 0

  function addMessage(content: string, opts: { role?: string; sender?: string } = {}): void {
    seq += 1
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString()
    testDb.db.insert(messagesTable).values({
      id: `m-${seq}`, agentId: AGENT_ID, role: opts.role ?? "user", content,
      sender: opts.sender ?? null, timestamp: at, createdAt: at,
    }).run()
  }

  beforeEach(() => {
    logs = silenceLogs()
    testDb = createTestDb()
    seq = 0
    const now = new Date().toISOString()
    testDb.db.insert(reposTable).values({
      id: "repo-slash-1", name: "o/r", path: "/tmp/x", workspacesPath: "/tmp/x/w",
      branchFrom: "origin/main", remote: "origin", createdAt: now,
    }).run()
    testDb.db.insert(agentsTable).values({
      id: AGENT_ID, repoId: "repo-slash-1", title: "T", status: "in-progress", branch: "b",
      model: "Sonnet 4.6", location: "loc", provider: "claude", streaming: 0,
      createdAt: now, updatedAt: now,
    }).run()
  })

  afterEach(() => {
    testDb.close()
    logs.restore()
  })

  it("returns distinct command names, newest first", () => {
    addMessage("/review")
    addMessage("/commit now")
    addMessage("just chatting")
    addMessage("/review again")
    expect(loadRecentCommandNames()).toEqual(["review", "commit"])
  })

  it("ignores assistant messages and messages delegated from other agents", () => {
    addMessage("/commit")
    addMessage("/explain", { role: "assistant" })
    addMessage("/push", { sender: "Other agent" })
    expect(loadRecentCommandNames()).toEqual(["commit"])
  })

  it("returns an empty list when no commands were used", () => {
    addMessage("hello")
    expect(loadRecentCommandNames()).toEqual([])
  })
})
