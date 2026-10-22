import { describe, expect, it } from "vitest"
import type { Message, ToolCall } from "../agents.types.js"
import { applySubagentUpdate, carrySubagentState } from "./subagentReducer.js"

function msg(id: string, toolCalls: ToolCall[]): Message {
  return { id, role: "assistant", content: "", timestamp: "t", toolCalls }
}

describe("applySubagentUpdate", () => {
  it("only touches the Agent call named by the frame", () => {
    const msgs = [
      msg("old", [{ id: "agent-old", tool: "Agent" }]),
      msg("new", [{ id: "agent-a", tool: "Agent" }, { id: "agent-b", tool: "Agent" }]),
    ]
    const next = applySubagentUpdate(msgs, "agent-b", { kind: "text", text: "hello" })
    expect(next[0]).toBe(msgs[0])
    expect(next[1]?.toolCalls?.[0]).toEqual({ id: "agent-a", tool: "Agent" })
    expect(next[1]?.toolCalls?.[1]?.outputText).toBe("hello")
  })

  it("appends sub-calls once and attaches their results", () => {
    let msgs = [msg("m", [{ id: "agent", tool: "Agent" }])]
    const toolCall = { id: "read", tool: "Read" }
    msgs = applySubagentUpdate(msgs, "agent", { kind: "toolCall", toolCall })
    msgs = applySubagentUpdate(msgs, "agent", { kind: "toolCall", toolCall })
    msgs = applySubagentUpdate(msgs, "agent", { kind: "toolResult", toolCallId: "read", result: "contents" })
    expect(msgs[0]?.toolCalls?.[0]?.subCalls).toEqual([{ id: "read", tool: "Read", result: "contents" }])
  })

  it("reaches a nested sub-agent", () => {
    const msgs = [msg("m", [{ id: "outer", tool: "Agent", subCalls: [{ id: "inner", tool: "Agent" }] }])]
    const next = applySubagentUpdate(msgs, "inner", { kind: "status", status: "running", progress: "Reading" })
    expect(next[0]?.toolCalls?.[0]?.subCalls?.[0]).toMatchObject({ subagentStatus: "running", subagentProgress: "Reading" })
  })

  it("keeps earlier status fields a partial update does not set", () => {
    let msgs = [msg("m", [{ id: "agent", tool: "Agent" }])]
    msgs = applySubagentUpdate(msgs, "agent", { kind: "status", status: "running", progress: "step 1" })
    msgs = applySubagentUpdate(msgs, "agent", { kind: "status", status: "completed", summary: "done" })
    expect(msgs[0]?.toolCalls?.[0]).toMatchObject({ subagentStatus: "completed", subagentSummary: "done", subagentProgress: "step 1" })
  })

  it("returns the same array for an unknown id", () => {
    const msgs = [msg("m", [{ id: "agent", tool: "Agent" }])]
    expect(applySubagentUpdate(msgs, "missing", { kind: "text", text: "x" })).toBe(msgs)
  })
})

describe("carrySubagentState", () => {
  it("keeps cached sub-agent state the done message lacks", () => {
    const cached = [msg("m", [{ id: "agent", tool: "Agent", subCalls: [{ id: "r", tool: "Read" }], outputText: "out", subagentStatus: "running" }])]
    const [merged] = carrySubagentState(cached, [{ id: "agent", tool: "Agent", result: "launched" }])
    expect(merged).toMatchObject({ result: "launched", subCalls: [{ id: "r", tool: "Read" }], outputText: "out", subagentStatus: "running" })
  })

  it("leaves calls the cache does not know untouched", () => {
    expect(carrySubagentState([], [{ id: "x", tool: "Read" }])).toEqual([{ id: "x", tool: "Read" }])
  })
})
