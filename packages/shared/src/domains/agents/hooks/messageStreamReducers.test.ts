import { describe, expect, it } from "vitest"
import { applyUserMessage, applyToolResult } from "./messageStreamReducers.js"
import type { Message } from "../agents.types.js"

const user1: Message = { id: "u1", role: "user", content: "first ask", timestamp: "t1" }
const streamingAssistant: Message = { id: "a1", role: "assistant", content: "working…", timestamp: "t2" }

function userEvent(id: string, content: string, injected?: boolean) {
  return { message: { id, role: "user" as const, content, timestamp: "t3", ...(injected ? { injected: true } : {}) } }
}

describe("applyUserMessage", () => {
  it("appends a user message at the end", () => {
    const next = applyUserMessage([user1, streamingAssistant], userEvent("u2", "follow up"))
    expect(next.map((m) => m.id)).toEqual(["u1", "a1", "u2"])
  })

  it("replaces the optimistic placeholder in place", () => {
    const optimistic: Message = { id: "optimistic-1", role: "user", content: "follow up", timestamp: "t3" }
    const next = applyUserMessage([user1, optimistic], userEvent("u2", "follow up"))
    expect(next.map((m) => m.id)).toEqual(["u1", "u2"])
  })

  it("drops a duplicate id", () => {
    const next = applyUserMessage([user1], userEvent("u1", "first ask"))
    expect(next.map((m) => m.id)).toEqual(["u1"])
  })

  it("carries the injected flag through for the badge", () => {
    const next = applyUserMessage([user1, streamingAssistant], userEvent("u2", "steer!", true))
    expect(next.map((m) => m.id)).toEqual(["u1", "a1", "u2"])
    expect(next[2]!.injected).toBe(true)
  })
})

describe("applyToolResult", () => {
  it("updates the tool call on the addressed message", () => {
    const msgs: Message[] = [{ ...streamingAssistant, toolCalls: [{ id: "tc1", tool: "Bash" }] }]
    const next = applyToolResult(msgs, "a1", "tc1", "done")
    expect(next[0]!.toolCalls![0]!.result).toBe("done")
  })

  it("finds the owning message when the event addresses a later segment", () => {
    // A tool started before a mid-run injection finishes after the turn was
    // split — the WS event then carries the NEW segment's message id.
    const seg1: Message = { id: "a1", role: "assistant", content: "", timestamp: "t2", toolCalls: [{ id: "tc1", tool: "Bash" }] }
    const seg2: Message = { id: "a2", role: "assistant", content: "", timestamp: "t4", toolCalls: [] }
    const next = applyToolResult([user1, seg1, seg2], "a2", "tc1", "late result")
    expect(next[1]!.toolCalls![0]!.result).toBe("late result")
    expect(next[2]!.toolCalls).toEqual([])
  })
})
