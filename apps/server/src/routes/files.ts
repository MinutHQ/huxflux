import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, fileChanges, repos } from "../db/schema.js"
import { getFileChanges, getDiff } from "../git/worktrees.js"
import * as path from "node:path"

export async function filesRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/files — list file changes from DB
  app.get<{ Params: { id: string } }>("/api/agents/:id/files", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    return db.select().from(fileChanges).where(eq(fileChanges.agentId, req.params.id)).all()
  })

  // GET /api/agents/:id/files/diff?path=src/foo.ts — unified diff from git
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/agents/:id/files/diff",
    async (req, reply) => {
      const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })
      if (!agent.repoId) return reply.code(400).send({ error: "Agent has no linked repo" })

      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (!repo) return reply.code(404).send({ error: "Repo not found" })

      const filePath = req.query.path ?? ""
      const worktreePath = path.join(repo.workspacesPath, agent.location)
      const diff = await getDiff(worktreePath, filePath)
      reply.header("Content-Type", "text/plain")
      return diff
    }
  )

  // POST /api/agents/:id/files/refresh — re-scan worktree and update DB
  app.post<{ Params: { id: string } }>("/api/agents/:id/files/refresh", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const worktreePath = path.join(repo.workspacesPath, agent.location)
    const files = await getFileChanges(worktreePath)

    // Replace file changes in DB
    await db.delete(fileChanges).where(eq(fileChanges.agentId, req.params.id))
    for (const f of files) {
      await db.insert(fileChanges).values({
        id: `${req.params.id}-${f.path.replace(/[/\\]/g, "-")}`,
        agentId: req.params.id,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
      })
    }

    return files
  })
}
