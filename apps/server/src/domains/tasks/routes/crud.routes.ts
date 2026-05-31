import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { v4 as uuid } from "uuid"
import { eq, isNull } from "drizzle-orm"
import { createTaskBodySchema, updateTaskBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { tasks, taskAgents } from "../../../db/schema.js"
import { config } from "../../../config.js"
import { loadAllTasks } from "../service/loadTasks.js"

const idParamsSchema = z.object({ id: z.string() })

/** Create / update / delete task rows. */
export const crudRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/api/tasks", {
    schema: { body: createTaskBodySchema },
  }, async (req) => {
    const { title, description, status, priority, assignee, projectKey, parentId, jiraKey, repoId } = req.body

    const now = new Date().toISOString()
    const id = uuid()

    // Get sort order: max + 1 for siblings
    const siblings = parentId
      ? db.select().from(tasks).where(eq(tasks.parentId, parentId)).all()
      : db.select().from(tasks).where(isNull(tasks.parentId)).all()
    const maxOrder = siblings.reduce((max: number, s: { sortOrder: number }) => Math.max(max, s.sortOrder), -1)

    db.insert(tasks).values({
      id,
      parentId: parentId ?? null,
      jiraKey: jiraKey ?? null,
      title,
      description: description ?? null,
      status: status ?? "backlog",
      priority: priority ?? null,
      assignee: assignee ?? null,
      projectKey: projectKey ?? null,
      repoId: repoId ?? null,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    }).run()

    return loadAllTasks()
  })

  app.patch("/api/tasks/:id", {
    schema: { params: idParamsSchema, body: updateTaskBodySchema },
  }, async (req) => {
    const { id } = req.params
    const body = req.body

    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!existing) return { error: "not found" }

    const wasReady = existing.status === "ready"
    db.update(tasks).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(eq(tasks.id, id)).run()

    // Auto-create agent when task moves to "ready" and has a repo
    if (body.status === "ready" && !wasReady) {
      await maybeAutoStartWork(id)
    }

    return loadAllTasks()
  })

  app.delete("/api/tasks/:id", {
    schema: { params: idParamsSchema },
  }, async (req) => {
    const { id } = req.params
    deleteRecursive(id)
    return loadAllTasks()
  })
}

async function maybeAutoStartWork(id: string) {
  const updated = db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!updated?.repoId) return
  // Skip if there's already a linked agent
  const existingAgent = db.select().from(taskAgents).where(eq(taskAgents.taskId, id)).all()
  if (existingAgent.length > 0) return
  try {
    // Fire start-work via internal HTTP to reuse full agent creation logic
    await fetch(`http://localhost:${config.boundPort}/api/tasks/${id}/start-work`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      },
      body: JSON.stringify({}),
    })
  } catch (err) {
    console.error(`[tasks] auto-start failed for ${id}:`, err)
  }
}

/** Delete subtasks recursively. SQLite cascade handles task_agents / task_comments. */
function deleteRecursive(taskId: string) {
  const children = db.select().from(tasks).where(eq(tasks.parentId, taskId)).all()
  for (const child of children) deleteRecursive(child.id)
  db.delete(tasks).where(eq(tasks.id, taskId)).run()
}
