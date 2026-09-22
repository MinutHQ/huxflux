import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { captureWsEvents, type CapturedWsEvents } from "../../../../test/harness.js"
import { isTaskListTool, noteTaskListToolResult, readTaskList, taskListDir } from "./taskList.js"

const AGENT = "agent-tasks-1"

let configDir: string

function writeTask(agentId: string, id: string, body: Record<string, unknown>): void {
  const dir = taskListDir(agentId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, blocks: [], blockedBy: [], ...body }))
}

beforeEach(() => {
  configDir = mkdtempSync(path.join(os.tmpdir(), "huxflux-tasklist-"))
  vi.stubEnv("CLAUDE_CONFIG_DIR", configDir)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(configDir, { recursive: true, force: true })
})

describe("taskListDir", () => {
  it("lives under the Claude config dir and sanitises the agent id like the CLI does", () => {
    expect(taskListDir("agent/with:odd chars")).toBe(path.join(configDir, "tasks", "agent-with-odd-chars"))
  })
})

describe("readTaskList", () => {
  it("returns an empty list when the agent has no task directory", () => {
    expect(readTaskList(AGENT)).toEqual({ tasks: [] })
  })

  it("reads every task file, sorted by numeric id", () => {
    writeTask(AGENT, "10", { subject: "Tenth", status: "pending" })
    writeTask(AGENT, "2", { subject: "Second", description: "Do it", status: "in_progress", activeForm: "Doing it" })
    writeTask(AGENT, "1", { subject: "First", status: "completed" })
    const { tasks } = readTaskList(AGENT)
    expect(tasks.map((t) => t.id)).toEqual(["1", "2", "10"])
    expect(tasks[1]).toMatchObject({ subject: "Second", description: "Do it", status: "in_progress", activeForm: "Doing it", blockedBy: [] })
  })

  it("skips the lock file, hidden files, and malformed task files", () => {
    writeTask(AGENT, "1", { subject: "Good", status: "pending" })
    const dir = taskListDir(AGENT)
    writeFileSync(path.join(dir, ".lock"), "")
    writeFileSync(path.join(dir, "2.json"), "{ not json")
    writeFileSync(path.join(dir, "3.json"), JSON.stringify({ id: "3", status: "pending" }))
    writeFileSync(path.join(dir, "notes.txt"), "ignored")
    const { tasks } = readTaskList(AGENT)
    expect(tasks.map((t) => t.id)).toEqual(["1"])
  })

  it("keeps blockedBy ids so the UI can show dependencies", () => {
    writeTask(AGENT, "1", { subject: "A", status: "pending" })
    writeTask(AGENT, "2", { subject: "B", status: "pending", blockedBy: ["1"] })
    const { tasks } = readTaskList(AGENT)
    expect(tasks[1]?.blockedBy).toEqual(["1"])
  })
})

describe("isTaskListTool", () => {
  it("matches only the two mutating task tools", () => {
    expect(isTaskListTool("TaskCreate")).toBe(true)
    expect(isTaskListTool("TaskUpdate")).toBe(true)
    expect(isTaskListTool("TaskList")).toBe(false)
    expect(isTaskListTool("TaskStop")).toBe(false)
    expect(isTaskListTool(undefined)).toBe(false)
  })
})

describe("noteTaskListToolResult", () => {
  let ws: CapturedWsEvents
  beforeEach(() => { ws = captureWsEvents([AGENT]) })
  afterEach(() => { ws.restore() })

  it("re-reads the list and emits tasks:state after a TaskCreate result", () => {
    writeTask(AGENT, "1", { subject: "Write hello file", status: "in_progress" })
    noteTaskListToolResult(AGENT, "TaskCreate")
    const events = ws.events.filter((e) => e.type === "tasks:state")
    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event?.type === "tasks:state" && event.agentId).toBe(AGENT)
    expect(event?.type === "tasks:state" && event.state.tasks.map((t) => t.subject)).toEqual(["Write hello file"])
  })

  it("does nothing for unrelated tool results", () => {
    writeTask(AGENT, "1", { subject: "A", status: "pending" })
    noteTaskListToolResult(AGENT, "Bash")
    noteTaskListToolResult(AGENT, undefined)
    expect(ws.events.filter((e) => e.type === "tasks:state")).toHaveLength(0)
  })
})
