import { inArray } from "drizzle-orm"
import type { SubagentStatus } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { toolCalls } from "../../../db/schema.js"
import type { ToolCall } from "../../../types.js"

type ToolCallRow = typeof toolCalls.$inferSelect

const subagentStatuses = new Set<string>(["running", "completed", "failed", "stopped"])

function toToolCall(row: ToolCallRow, subCalls: ToolCall[] | undefined): ToolCall {
  return {
    id: row.id,
    tool: row.tool,
    args: row.args ?? undefined,
    result: row.result ?? undefined,
    duration: row.duration ?? undefined,
    precedingText: row.precedingText ?? undefined,
    subCalls,
    outputText: row.outputText ?? undefined,
    subagentStatus: row.subagentStatus && subagentStatuses.has(row.subagentStatus)
      ? (row.subagentStatus as SubagentStatus)
      : undefined,
    subagentSummary: row.subagentSummary ?? undefined,
    subagentProgress: row.subagentProgress ?? undefined,
  }
}

/**
 * Group tool-call rows by message, nesting the calls a sub-agent made under
 * the Agent call that spawned it (`parent_id`). Rows whose parent is missing
 * are dropped. Siblings keep their `order_idx` order.
 */
export function buildToolCallTree(rows: ToolCallRow[]): Map<string, ToolCall[]> {
  const sorted = [...rows].sort((a, b) => a.orderIdx - b.orderIdx)
  const children = new Map<string, ToolCallRow[]>()
  for (const row of sorted) {
    if (!row.parentId) continue
    const list = children.get(row.parentId) ?? []
    list.push(row)
    children.set(row.parentId, list)
  }
  const build = (row: ToolCallRow): ToolCall => {
    const kids = children.get(row.id)
    return toToolCall(row, kids ? kids.map(build) : undefined)
  }
  const byMessage = new Map<string, ToolCall[]>()
  for (const row of sorted) {
    if (row.parentId) continue
    const list = byMessage.get(row.messageId) ?? []
    list.push(build(row))
    byMessage.set(row.messageId, list)
  }
  return byMessage
}

/** Load the tool calls of `messageIds` as trees, keyed by message id. */
export function loadToolCallTrees(messageIds: string[]): Map<string, ToolCall[]> {
  if (messageIds.length === 0) return new Map()
  return buildToolCallTree(db.select().from(toolCalls).where(inArray(toolCalls.messageId, messageIds)).all())
}
