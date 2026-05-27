import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents } from "../db/schema.js"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

export async function uploadRoutes(app: FastifyInstance) {
  // POST /api/agents/:id/upload — save to /tmp so Claude CLI can read them
  // (Claude restricts reads to project dir + /tmp, and /tmp needs no gitignore)
  app.post<{
    Params: { id: string }
    Body: { name: string; data: string; mimeType: string }
  }>("/api/agents/:id/upload", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    const attachmentsDir = path.join(os.tmpdir(), "huxflux-attachments", agent.id)
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
