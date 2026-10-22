import { describe, expect, it } from "vitest"
import type { toolCalls } from "../../../db/schema.js"
import { buildToolCallTree } from "./toolCallTree.js"

type ToolCallRow = typeof toolCalls.$inferSelect

function makeRow(id: string, overrides: Partial<ToolCallRow> = {}): ToolCallRow {
  return {
    id, messageId: "m1", parentId: null, tool: "Read", args: null, result: null, duration: null,
    orderIdx: 0, precedingText: null, outputText: null, subagentStatus: null, subagentSummary: null, subagentProgress: null,
    ...overrides,
  }
}

describe("buildToolCallTree", () => {
  it("nests sub-agent calls under their Agent call in order", () => {
    const tree = buildToolCallTree([
      makeRow("sub2", { parentId: "agent", orderIdx: 1 }),
      makeRow("agent", { tool: "Agent", orderIdx: 1, outputText: "out", subagentStatus: "completed", subagentSummary: "sum" }),
      makeRow("first", { orderIdx: 0 }),
      makeRow("sub1", { parentId: "agent", orderIdx: 0 }),
      makeRow("nested", { parentId: "sub2" }),
    ])
    const calls = tree.get("m1") ?? []
    expect(calls.map((c) => c.id)).toEqual(["first", "agent"])
    const agent = calls[1]
    expect(agent?.subCalls?.map((c) => c.id)).toEqual(["sub1", "sub2"])
    expect(agent?.subCalls?.[1]?.subCalls?.map((c) => c.id)).toEqual(["nested"])
    expect(agent).toMatchObject({ outputText: "out", subagentStatus: "completed", subagentSummary: "sum" })
    expect(calls[0]?.subCalls).toBeUndefined()
  })

  it("groups by message and drops orphaned sub-calls", () => {
    const tree = buildToolCallTree([
      makeRow("a", { messageId: "m1" }),
      makeRow("b", { messageId: "m2" }),
      makeRow("orphan", { parentId: "gone" }),
    ])
    expect(tree.get("m1")?.map((c) => c.id)).toEqual(["a"])
    expect(tree.get("m2")?.map((c) => c.id)).toEqual(["b"])
  })

  it("ignores status values it does not know", () => {
    const tree = buildToolCallTree([makeRow("a", { subagentStatus: "weird" })])
    expect(tree.get("m1")?.[0]?.subagentStatus).toBeUndefined()
  })
})
