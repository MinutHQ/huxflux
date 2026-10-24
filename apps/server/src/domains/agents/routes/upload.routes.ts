import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { createReadStream } from "node:fs"
import { uploadFileBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents } from "../../../db/schema.js"
import { UPLOAD_BODY_LIMIT, resolveAttachment, saveAttachment } from "../service/attachments.js"
import { resolveSharedFile } from "../service/sharedFiles.js"
import { contentDisposition } from "../../git/rawFile.js"

const idParamsSchema = z.object({ id: z.string() })
const fileParamsSchema = z.object({ id: z.string(), file: z.string() })

export const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/agents/:id/upload — store a chat attachment the model can read
  app.post("/api/agents/:id/upload", {
    bodyLimit: UPLOAD_BODY_LIMIT,
    schema: { params: idParamsSchema, body: uploadFileBodySchema },
  }, async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    return saveAttachment(agent.id, req.body)
  })

  // GET /api/agents/:id/attachments/:file — serve an attachment back for previews
  app.get("/api/agents/:id/attachments/:file", {
    schema: { params: fileParamsSchema },
  }, async (req, reply) => {
    const file = await resolveAttachment(req.params.id, req.params.file)
    return reply
      .header("Content-Type", file.mimeType)
      .header("Cache-Control", "private, max-age=86400")
      .header("X-Content-Type-Options", "nosniff")
      // The URL carries the auth token; never forward it as a referrer.
      .header("Referrer-Policy", "no-referrer")
      .send(createReadStream(file.path))
  })

  // GET /api/agents/:id/shared/:file — download a file the agent shared in chat.
  // Loaded through plain links (browser, mobile system browser), so the token
  // rides in the query string.
  app.get("/api/agents/:id/shared/:file", {
    schema: { params: fileParamsSchema },
  }, async (req, reply) => {
    const file = await resolveSharedFile(req.params.id, req.params.file)
    const name = req.params.file.replace(/^[0-9a-f]{8}-/, "")
    return reply
      // Android only offers to install an APK served with its own type.
      .header("Content-Type", name.endsWith(".apk") ? "application/vnd.android.package-archive" : "application/octet-stream")
      .header("Content-Length", file.size)
      .header("Content-Disposition", contentDisposition("attachment", name))
      .header("Cache-Control", "private, max-age=86400")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .send(createReadStream(file.path))
  })
}
