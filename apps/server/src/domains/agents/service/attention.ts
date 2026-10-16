import { isNull } from "drizzle-orm"
import type { AttentionItem, ServerAttention } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents } from "../agents.db.js"
import { getPendingQuestion } from "../../../askStore.js"

const MAX_ITEMS = 5

type AgentRow = Pick<typeof agents.$inferSelect, "id" | "title" | "parentAgentId" | "taskId" | "unread" | "updatedAt">

/**
 * Summarise what the user owes this server: agents blocked on a question
 * card and agents with an unseen finished turn. Child sessions count toward
 * their parent (that is where the card renders), and task agents are skipped
 * because they report through task comments rather than the sidebar.
 */
export function summarizeAttention(rows: AgentRow[], isWaiting: (agentId: string) => boolean): ServerAttention {
  const byTarget = new Map<string, AttentionItem & { updatedAt: string }>()
  const titles = new Map(rows.map((r) => [r.id, r.title]))

  for (const row of rows) {
    if (row.taskId) continue
    const targetId = row.parentAgentId ?? row.id
    const reason = isWaiting(row.id) ? "waiting" : !row.parentAgentId && (row.unread ?? 0) > 0 ? "unread" : null
    if (!reason) continue
    const existing = byTarget.get(targetId)
    const updatedAt = existing && existing.updatedAt > row.updatedAt ? existing.updatedAt : row.updatedAt
    // "waiting" outranks "unread"; recency is the newest row seen for the target.
    const merged = existing?.reason === "waiting" ? "waiting" : reason
    byTarget.set(targetId, { agentId: targetId, title: titles.get(targetId) ?? row.title, reason: merged, updatedAt })
  }

  const all = [...byTarget.values()].sort((a, b) =>
    a.reason === b.reason ? b.updatedAt.localeCompare(a.updatedAt) : a.reason === "waiting" ? -1 : 1,
  )
  return {
    waiting: all.filter((i) => i.reason === "waiting").length,
    unread: all.filter((i) => i.reason === "unread").length,
    items: all.slice(0, MAX_ITEMS).map(({ agentId, title, reason }) => ({ agentId, title, reason })),
  }
}

export function loadAttention(): ServerAttention {
  const rows = db
    .select({
      id: agents.id,
      title: agents.title,
      parentAgentId: agents.parentAgentId,
      taskId: agents.taskId,
      unread: agents.unread,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(isNull(agents.deletedAt))
    .all()
  return summarizeAttention(rows, (id) => getPendingQuestion(id) !== undefined)
}
