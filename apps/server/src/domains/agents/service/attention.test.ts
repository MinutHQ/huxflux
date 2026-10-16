import { describe, expect, it } from "vitest"
import { summarizeAttention } from "./attention.js"

interface RowInput {
  id: string
  title?: string
  parentAgentId?: string | null
  taskId?: string | null
  unread?: number | null
  updatedAt?: string
}

function row(input: RowInput) {
  return {
    title: input.id,
    parentAgentId: null,
    taskId: null,
    unread: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...input,
  }
}

const none = () => false

describe("summarizeAttention", () => {
  it("returns zero counts when nothing needs the user", () => {
    expect(summarizeAttention([row({ id: "a" })], none)).toEqual({ waiting: 0, unread: 0, items: [] })
  })

  it("counts unread agents", () => {
    const result = summarizeAttention([row({ id: "a", unread: 2 }), row({ id: "b", unread: 1 })], none)
    expect(result.waiting).toBe(0)
    expect(result.unread).toBe(2)
  })

  it("counts an agent with a pending question as waiting only, even when unread", () => {
    const result = summarizeAttention([row({ id: "a", unread: 3 })], (id) => id === "a")
    expect(result).toEqual({ waiting: 1, unread: 0, items: [{ agentId: "a", title: "a", reason: "waiting" }] })
  })

  it("attributes a child session's question to its parent", () => {
    const rows = [row({ id: "parent", title: "Parent" }), row({ id: "child", parentAgentId: "parent", title: "Child" })]
    const result = summarizeAttention(rows, (id) => id === "child")
    expect(result.items).toEqual([{ agentId: "parent", title: "Parent", reason: "waiting" }])
  })

  it("upgrades an unread parent to waiting when its child is waiting, in either row order", () => {
    const parent = row({ id: "parent", unread: 1 })
    const child = row({ id: "child", parentAgentId: "parent" })
    const isWaiting = (id: string) => id === "child"
    for (const rows of [[parent, child], [child, parent]]) {
      const result = summarizeAttention(rows, isWaiting)
      expect(result.waiting).toBe(1)
      expect(result.unread).toBe(0)
    }
  })

  it("ignores unread counts on child sessions", () => {
    const rows = [row({ id: "parent" }), row({ id: "child", parentAgentId: "parent", unread: 4 })]
    expect(summarizeAttention(rows, none).unread).toBe(0)
  })

  it("skips task agents", () => {
    const result = summarizeAttention([row({ id: "t", taskId: "task-1", unread: 1 })], (id) => id === "t")
    expect(result).toEqual({ waiting: 0, unread: 0, items: [] })
  })

  it("orders waiting before unread, newest first, and caps items at five", () => {
    const rows = [
      ...["u1", "u2", "u3", "u4"].map((id, i) => row({ id, unread: 1, updatedAt: `2026-01-0${i + 1}T00:00:00.000Z` })),
      row({ id: "w1", updatedAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: "w2", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ]
    const result = summarizeAttention(rows, (id) => id.startsWith("w"))
    expect(result.waiting).toBe(2)
    expect(result.unread).toBe(4)
    expect(result.items.map((i) => i.agentId)).toEqual(["w2", "w1", "u4", "u3", "u2"])
  })
})
