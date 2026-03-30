import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import { db } from "../db/index.js"
import { repos } from "../db/schema.js"
import { eq } from "drizzle-orm"
import type { Repo } from "../types.js"

export async function reposRoutes(app: FastifyInstance) {
  app.get("/api/repos", async () => {
    return db.select().from(repos).all()
  })

  app.post<{ Body: Omit<Repo, "id" | "createdAt"> }>("/api/repos", async (req, reply) => {
    const now = new Date().toISOString()
    const id = uuid()
    const body = req.body
    await db.insert(repos).values({
      id,
      name: body.name,
      path: body.path,
      workspacesPath: body.workspacesPath,
      branchFrom: body.branchFrom ?? "origin/main",
      remote: body.remote ?? "origin",
      previewUrl: body.previewUrl,
      setupScript: body.setupScript,
      runScript: body.runScript,
      archiveScript: body.archiveScript,
      createdAt: now,
    })
    reply.code(201)
    return db.select().from(repos).where(eq(repos.id, id)).get()
  })

  app.patch<{ Params: { id: string }; Body: Partial<Repo> }>("/api/repos/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body
    await db.update(repos).set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.path !== undefined && { path: body.path }),
      ...(body.workspacesPath !== undefined && { workspacesPath: body.workspacesPath }),
      ...(body.branchFrom !== undefined && { branchFrom: body.branchFrom }),
      ...(body.remote !== undefined && { remote: body.remote }),
      ...(body.previewUrl !== undefined && { previewUrl: body.previewUrl }),
      ...(body.setupScript !== undefined && { setupScript: body.setupScript }),
      ...(body.runScript !== undefined && { runScript: body.runScript }),
      ...(body.archiveScript !== undefined && { archiveScript: body.archiveScript }),
    }).where(eq(repos.id, id))
    const updated = db.select().from(repos).where(eq(repos.id, id)).get()
    if (!updated) return reply.code(404).send({ error: "Not found" })
    return updated
  })

  app.delete<{ Params: { id: string } }>("/api/repos/:id", async (req, reply) => {
    await db.delete(repos).where(eq(repos.id, req.params.id))
    reply.code(204).send()
  })
}
