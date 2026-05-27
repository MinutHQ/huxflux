import type { FastifyInstance } from "fastify"
import * as os from "node:os"
import { getVersionInfo, checkForUpdate, triggerServerUpdate } from "../updater.js"

export async function systemRoutes(app: FastifyInstance) {
  app.get("/api/system/ssh-info", async () => {
    const host = process.env.HUXFLUX_SSH_HOST ?? os.hostname()
    const user = process.env.HUXFLUX_SSH_USER ?? process.env.USER ?? process.env.USERNAME ?? "user"
    const port = parseInt(process.env.HUXFLUX_SSH_PORT ?? "22", 10)
    const configured = !!process.env.HUXFLUX_SSH_USER
    return { host, port, user, configured }
  })

  // Returns current and latest server version
  app.get("/api/system/version", async () => {
    return getVersionInfo()
  })

  // Force a version check against npm registry
  app.post("/api/system/version/check", async () => {
    return checkForUpdate()
  })

  // Trigger server update (npm install + restart)
  app.post("/api/system/update", async (_req, reply) => {
    const info = getVersionInfo()
    if (!info.updateAvailable) {
      return reply.status(400).send({ error: "No update available" })
    }
    const result = await triggerServerUpdate()
    if (!result.success) {
      return reply.status(500).send({ error: result.error ?? "Update failed" })
    }
    return { success: true, message: "Update installed, server restarting..." }
  })
}
