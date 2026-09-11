import { EventEmitter } from "node:events"
import type { ChildProcess } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { captureWsEvents, type CapturedWsEvents } from "../../../../test/harness.js"
import { runningProcesses } from "./processRegistry.js"
import {
  clearBackgroundState,
  getBackgroundState,
  noteBackgroundToolResult,
  noteBackgroundToolUse,
  parseTaskId,
  scheduleLingerCheck,
  toBackgroundTask,
} from "./backgroundTasks.js"

const AGENT = "agent-bg-1"

function backgroundEvents(ws: CapturedWsEvents) {
  return ws.events.filter((e) => e.type === "background:state")
}

describe("toBackgroundTask", () => {
  it("maps a Monitor tool_use to a monitor task with its description", () => {
    const task = toBackgroundTask({
      id: "tu1",
      name: "Monitor",
      input: { command: "tail -f /tmp/run.log", description: "watch run 6", persistent: true },
    })
    expect(task).not.toBeNull()
    expect(task!.kind).toBe("monitor")
    expect(task!.label).toBe("watch run 6")
    expect(task!.command).toBe("tail -f /tmp/run.log")
    expect(task!.persistent).toBe(true)
    expect(task!.toolUseId).toBe("tu1")
  })

  it("maps Bash only when run_in_background is set", () => {
    expect(toBackgroundTask({ id: "a", name: "Bash", input: { command: "pnpm test" } })).toBeNull()
    const task = toBackgroundTask({ id: "b", name: "Bash", input: { command: "pnpm dev", run_in_background: true } })
    expect(task!.kind).toBe("bash")
    expect(task!.label).toBe("pnpm dev")
  })

  it("ignores foreground tools and malformed input", () => {
    expect(toBackgroundTask({ id: "a", name: "Read", input: { file_path: "x" } })).toBeNull()
    expect(toBackgroundTask({ id: "b", name: "Monitor", input: null })!.label).toBe("Monitor")
  })
})

describe("parseTaskId", () => {
  it("reads the Monitor and background Bash id formats", () => {
    expect(parseTaskId("Monitor started (task bvavwwpq3, persistent — runs until TaskStop)")).toBe("bvavwwpq3")
    expect(parseTaskId("Command running in background with ID: b7f2a1")).toBe("b7f2a1")
    expect(parseTaskId("plain output")).toBeUndefined()
  })
})

describe("background state registry", () => {
  let ws: CapturedWsEvents

  beforeEach(() => {
    ws = captureWsEvents([AGENT])
  })

  afterEach(() => {
    clearBackgroundState(AGENT)
    runningProcesses.delete(AGENT)
    ws.restore()
  })

  it("adds a task on tool_use, attaches the task id on tool_result, and broadcasts", () => {
    noteBackgroundToolUse(AGENT, { id: "tu1", name: "Monitor", input: { command: "tail -f x", description: "watch" } })
    expect(getBackgroundState(AGENT).tasks.map((t) => t.toolUseId)).toEqual(["tu1"])

    noteBackgroundToolResult(AGENT, "tu1", "Monitor started (task abc123, persistent)")
    expect(getBackgroundState(AGENT).tasks[0]?.taskId).toBe("abc123")

    const emitted = backgroundEvents(ws)
    expect(emitted).toHaveLength(2)
    const last = emitted[1]
    expect(last?.type === "background:state" && last.state.tasks[0]?.taskId).toBe("abc123")
  })

  it("does not track results for untracked tool_use ids or duplicate tool_use ids", () => {
    noteBackgroundToolResult(AGENT, "unknown", "Monitor started (task zzz)")
    expect(getBackgroundState(AGENT).tasks).toEqual([])

    const block = { id: "tu1", name: "Bash", input: { command: "pnpm dev", run_in_background: true } }
    noteBackgroundToolUse(AGENT, block)
    noteBackgroundToolUse(AGENT, block)
    expect(getBackgroundState(AGENT).tasks).toHaveLength(1)
  })

  it("removes a task when TaskStop names its task id", () => {
    noteBackgroundToolUse(AGENT, { id: "tu1", name: "Monitor", input: { command: "tail -f x" } })
    noteBackgroundToolResult(AGENT, "tu1", "Monitor started (task abc123)")
    noteBackgroundToolUse(AGENT, { id: "tu2", name: "TaskStop", input: { task_id: "abc123" } })
    expect(getBackgroundState(AGENT).tasks).toEqual([])
  })

  it("flags the agent as lingering when the CLI outlives its result, and clears on exit", async () => {
    const proc = Object.assign(new EventEmitter(), { pid: 4242, exitCode: null, signalCode: null }) as unknown as ChildProcess
    runningProcesses.set(AGENT, proc)

    scheduleLingerCheck(AGENT, proc)
    await new Promise((r) => setTimeout(r, 1700))
    expect(getBackgroundState(AGENT).lingering).toBe(true)

    clearBackgroundState(AGENT)
    expect(getBackgroundState(AGENT)).toEqual({ tasks: [], lingering: false })
    const last = backgroundEvents(ws).at(-1)
    expect(last?.type === "background:state" && last.state).toEqual({ tasks: [], lingering: false })
  })

  it("does not flag lingering when the process already exited", async () => {
    const proc = Object.assign(new EventEmitter(), { pid: 4243, exitCode: 0, signalCode: null }) as unknown as ChildProcess
    runningProcesses.set(AGENT, proc)
    scheduleLingerCheck(AGENT, proc)
    await new Promise((r) => setTimeout(r, 1700))
    expect(getBackgroundState(AGENT).lingering).toBe(false)
    expect(backgroundEvents(ws)).toHaveLength(0)
  })
})
