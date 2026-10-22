import { describe, expect, it } from "vitest"
import { isAgentTool, isToolCallRunning, subagentResultText } from "./subagents.js"

describe("isAgentTool", () => {
  it("matches the current and older tool names", () => {
    expect(isAgentTool("Agent")).toBe(true)
    expect(isAgentTool("Task")).toBe(true)
    expect(isAgentTool("Bash")).toBe(false)
    expect(isAgentTool(undefined)).toBe(false)
  })
})

describe("isToolCallRunning", () => {
  it("follows the sub-agent status when one was reported", () => {
    const launched = { id: "a", tool: "Agent", result: "Async agent launched" }
    expect(isToolCallRunning({ ...launched, subagentStatus: "running" }, false)).toBe(true)
    expect(isToolCallRunning({ ...launched, subagentStatus: "completed" }, true)).toBe(false)
  })

  it("falls back to streaming without a result", () => {
    expect(isToolCallRunning({ id: "a", tool: "Read" }, true)).toBe(true)
    expect(isToolCallRunning({ id: "a", tool: "Read" }, false)).toBe(false)
    expect(isToolCallRunning({ id: "a", tool: "Read", result: "x" }, true)).toBe(false)
  })
})

describe("subagentResultText", () => {
  it("hides the launch receipt while the sub-agent runs", () => {
    expect(subagentResultText({ id: "a", tool: "Agent", result: "Async agent launched", subagentStatus: "running" })).toBeUndefined()
  })

  it("prefers the finish summary over the tool result", () => {
    expect(subagentResultText({ id: "a", tool: "Agent", result: "Async agent launched", subagentStatus: "completed", subagentSummary: "found it" })).toBe("found it")
  })

  it("uses the tool result for a sub-agent without task events", () => {
    expect(subagentResultText({ id: "a", tool: "Agent", result: "final answer" })).toBe("final answer")
  })

  it("skips text the streamed output already ends with", () => {
    expect(subagentResultText({ id: "a", tool: "Agent", outputText: "Looking.\n\nfound it\n", subagentSummary: "found it" })).toBeUndefined()
  })
})
