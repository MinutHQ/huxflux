import { v4 as uuid } from "uuid"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import {
  agents as agentsTable,
  tasks as tasksTable,
  taskComments as taskCommentsTable,
  taskDependencies as taskDepsTable,
} from "../../../db/schema.js"
import { tasksWs } from "../tasks.ws.js"
import { defineTagHandler, type TagHandler } from "../../agent-runner/agent-runner.types.js"

// Tag handlers for `<huxflux:tasks.*>` directives. The runner has no built-in
// awareness of these; they are wired up at call sites (refine, startWork, etc.)
// that own the task lifecycle.

/**
 * `<huxflux:tasks.comment taskId="...">content</huxflux:tasks.comment>`
 *
 * Inserts a new comment authored by the running agent. The agent's title is
 * stored as `author` for display.
 */
export function taskCommentHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "tasks.comment",
    args: z.object({ taskId: z.string().min(1) }),
    onTag: ({ args, body }) => {
      const content = body.trim()
      if (!content) return
      const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      const id = uuid()
      const now = new Date().toISOString()
      db.insert(taskCommentsTable).values({
        id,
        taskId: args.taskId,
        agentId,
        author: agent?.title ?? "Agent",
        role: "ai",
        content,
        createdAt: now,
      }).run()
      tasksWs.taskComment(args.taskId, {
        id, author: agent?.title ?? "Agent", role: "ai", content, agentId, createdAt: now,
      })
    },
  })
}

/**
 * `<huxflux:tasks.update taskId="..." field="description">new content</huxflux:tasks.update>`
 *
 * Updates a single supported field on a task. Only `description` is allowed;
 * other fields are silently ignored so a misbehaving model can't overwrite
 * the title.
 */
export function taskUpdateHandler(): TagHandler {
  return defineTagHandler({
    id: "tasks.update",
    args: z.object({ taskId: z.string().min(1), field: z.string().min(1) }),
    onTag: ({ args, body }) => {
      if (args.field !== "description") return
      db.update(tasksTable)
        .set({ description: body.trim(), updatedAt: new Date().toISOString() })
        .where(eq(tasksTable.id, args.taskId))
        .run()
      tasksWs.taskUpdated(args.taskId)
    },
  })
}

/**
 * `<huxflux:tasks.create parentId="..." repoId="...">{ "title": "...", "description": "..." }</huxflux:tasks.create>`
 *
 * Creates a new task under the given parent. The body is JSON-decoded;
 * malformed JSON is skipped without throwing so one bad tag never aborts the
 * rest.
 */
export function taskCreateHandler(): TagHandler {
  return defineTagHandler({
    id: "tasks.create",
    args: z.object({ parentId: z.string().min(1), repoId: z.string().optional() }),
    onTag: ({ args, body }) => {
      try {
        const data = JSON.parse(body.trim()) as { title: string; description?: string }
        const now = new Date().toISOString()
        db.insert(tasksTable).values({
          id: uuid(),
          parentId: args.parentId,
          repoId: args.repoId || null,
          title: data.title,
          description: data.description ?? null,
          status: "backlog",
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        }).run()
        tasksWs.taskUpdated(args.parentId)
      } catch {
        // malformed JSON
      }
    },
  })
}

/**
 * `<huxflux:tasks.status taskId="..." status="ready"/>`
 *
 * Self-closing. Sets the task status to the provided value and broadcasts
 * `task:updated`. The status string is not constrained here — calling code
 * trusts the agent.
 */
export function taskStatusHandler(): TagHandler {
  return defineTagHandler({
    id: "tasks.status",
    args: z.object({ taskId: z.string().min(1), status: z.string().min(1) }),
    onTag: ({ args }) => {
      db.update(tasksTable)
        .set({ status: args.status, updatedAt: new Date().toISOString() })
        .where(eq(tasksTable.id, args.taskId))
        .run()
      tasksWs.taskUpdated(args.taskId)
    },
  })
}

/**
 * `<huxflux:tasks.dependency taskId="..." dependsOn="..."/>`
 *
 * Self-closing. Records a dependency edge if not already present. Duplicate
 * pairs are deduped so re-running the same agent on the same input is safe.
 */
export function taskDependencyHandler(): TagHandler {
  return defineTagHandler({
    id: "tasks.dependency",
    args: z.object({ taskId: z.string().min(1), dependsOn: z.string().min(1) }),
    onTag: ({ args }) => {
      const existing = db.select().from(taskDepsTable).where(eq(taskDepsTable.taskId, args.taskId)).all()
      if (existing.some((e: { dependsOnTaskId: string }) => e.dependsOnTaskId === args.dependsOn)) return
      db.insert(taskDepsTable).values({ id: uuid(), taskId: args.taskId, dependsOnTaskId: args.dependsOn }).run()
      tasksWs.taskUpdated(args.taskId)
    },
  })
}
