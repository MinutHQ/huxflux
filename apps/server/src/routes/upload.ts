import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, repos } from "../db/schema.js"
import { DATA_DIR } from "../config.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"

export async function uploadRoutes(app: FastifyInstance) {
  // POST /api/agents/:id/upload — accept a base64-encoded file, save to huxflux data dir
  app.post<{
    Params: { id: string }
    Body: { name: string; data: string; mimeType: string }
  }>("/api/agents/:id/upload", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    // Store attachments in huxflux data dir, not in the worktree
    const attachmentsDir = path.join(DATA_DIR, "attachments", agent.id)
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
