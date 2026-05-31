// Domain-local pure helpers for tasks.
//
// findItem and applyNestedUpdate are used by the full-view stack-navigation
// flow. generateRefineSubtasks is used by the refine conversation pane.
// loadRefineSessions / saveRefineSessions wrap the localStorage adapter for
// refine sessions.

import type { Repo, TaskItem } from "@huxflux/shared"
import { REFINE_STORAGE_KEY } from "./config"
import type { RefineSession, RefineSubtask } from "./tasks.types"

/** Find a task by id in a nested task tree. */
export function findItem(items: TaskItem[], id: string): TaskItem | null {
  for (const item of items) {
    if (item.id === id) return item
    const found = findItem(item.subtasks, id)
    if (found) return found
  }
  return null
}

/** Walk a stack of nested TaskItems and rebuild from the bottom up with updates applied. */
export function applyNestedUpdate(
  stack: TaskItem[],
  updates: Partial<TaskItem>,
): TaskItem {
  if (stack.length === 0) throw new Error("empty stack")
  // Start from the deepest item (already updated)
  const last = stack[stack.length - 1]
  if (!last) throw new Error("empty stack")
  let child = { ...last, ...updates }
  // Walk up the stack, replacing matching subtask at each level
  for (let i = stack.length - 2; i >= 0; i--) {
    const parent = stack[i]
    if (!parent) continue
    child = {
      ...parent,
      subtasks: parent.subtasks.map((s) => (s.id === child.id ? child : s)),
    }
  }
  return child
}

// ── Refine subtask generation ────────────────────────────────────────────────

/**
 * Generate a starter subtask list for a refine session. One implementation
 * subtask per selected repo; if 2+ repos are selected, also adds a test
 * subtask against the first repo so the spec isn't empty.
 */
export function generateRefineSubtasks(
  session: RefineSession,
  repos: Repo[],
): RefineSubtask[] {
  const selected = session.repoIds
    .map((id) => repos.find((r) => r.id === id))
    .filter((r): r is Repo => !!r)

  const tasks: RefineSubtask[] = selected.map((repo) => ({
    id: `${repo.id}-impl`,
    repoId: repo.id,
    repoName: repo.name,
    title: `Implement changes for ${session.ticketId}`,
  }))

  const first = selected[0]
  if (selected.length >= 2 && first) {
    tasks.push({
      id: `${first.id}-tests`,
      repoId: first.id,
      repoName: first.name,
      title: `Write tests for ${session.ticketId}`,
    })
  }

  return tasks
}

// ── Refine session persistence ───────────────────────────────────────────────

export function loadRefineSessions(): RefineSession[] {
  try {
    const raw = localStorage.getItem(REFINE_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RefineSession[]) : []
  } catch {
    return []
  }
}

export function saveRefineSessions(sessions: RefineSession[]) {
  localStorage.setItem(REFINE_STORAGE_KEY, JSON.stringify(sessions))
}
