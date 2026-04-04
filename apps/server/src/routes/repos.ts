import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import * as path from "node:path"
import { db } from "../db/index.js"
import { repos } from "../db/schema.js"
import { eq } from "drizzle-orm"
import type { Repo } from "../types.js"
import { listBranches } from "../github/client.js"
import { getRemoteUrl } from "../git/worktrees.js"
import { config } from "../config.js"

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
      workspacesPath: body.workspacesPath ?? path.join(config.workspacesBase, body.name),
      branchFrom: body.branchFrom ?? "origin/main",
      branchPrefix: body.branchPrefix ?? null,
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
      ...(body.branchPrefix !== undefined && { branchPrefix: body.branchPrefix }),
      ...(body.remote !== undefined && { remote: body.remote }),
      ...(body.previewUrl !== undefined && { previewUrl: body.previewUrl }),
      ...(body.setupScript !== undefined && { setupScript: body.setupScript }),
      ...(body.runScript !== undefined && { runScript: body.runScript }),
      ...(body.archiveScript !== undefined && { archiveScript: body.archiveScript }),
      ...(body.preferences !== undefined && { preferences: body.preferences }),
      ...(body.icon !== undefined && { icon: body.icon }),
    }).where(eq(repos.id, id))
    const updated = db.select().from(repos).where(eq(repos.id, id)).get()
    if (!updated) return reply.code(404).send({ error: "Not found" })
    return updated
  })

  app.delete<{ Params: { id: string } }>("/api/repos/:id", async (req, reply) => {
    await db.delete(repos).where(eq(repos.id, req.params.id))
    reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>("/api/repos/:id/branches", async (req, reply) => {
    const repo = db.select().from(repos).where(eq(repos.id, req.params.id)).get()
    if (!repo) return reply.code(404).send({ error: "Not found" })
    const repoUrl = await getRemoteUrl(repo.path, repo.remote).catch(() => null)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })
    const branches = await listBranches(repoUrl).catch(() => [] as string[])
    return branches
  })
}
