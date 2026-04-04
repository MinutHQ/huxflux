import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, repos } from "../db/schema.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"

export async function uploadRoutes(app: FastifyInstance) {
  // POST /api/agents/:id/upload — accept a base64-encoded file, save to agent worktree
  app.post<{
    Params: { id: string }
    Body: { name: string; data: string; mimeType: string }
  }>("/api/agents/:id/upload", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    let worktreePath: string
    if (agent.repoId) {
      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      worktreePath = repo ? path.join(repo.workspacesPath, agent.location) : process.cwd()
    } else {
      worktreePath = process.cwd()
    }

    const attachmentsDir = path.join(worktreePath, ".huxflux_attachments")
    await fs.mkdir(attachmentsDir, { recursive: true })

    // Sanitise filename — reject traversal attempts
    const safeName = req.body.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    if (!safeName || safeName === "." || safeName === ".." || safeName.includes("..")) {
      return reply.code(400).send({ error: "Invalid filename" })
    }
    const filePath = path.resolve(attachmentsDir, safeName)
    if (!filePath.startsWith(attachmentsDir + path.sep) && filePath !== attachmentsDir) {
      return reply.code(400).send({ error: "Invalid filename" })
    }

    const base64 = req.body.data.replace(/^data:[^;]+;base64,/, "")
    await fs.writeFile(filePath, Buffer.from(base64, "base64"))

    return { path: filePath, name: safeName, mimeType: req.body.mimeType }
  })
}
