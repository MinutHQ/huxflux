import type { FastifyInstance } from "fastify"
import * as os from "node:os"

export async function systemRoutes(app: FastifyInstance) {
  app.get("/api/system/ssh-info", async () => {
    const host = process.env.HUXFLUX_SSH_HOST ?? os.hostname()
    const user = process.env.HUXFLUX_SSH_USER ?? process.env.USER ?? process.env.USERNAME ?? "user"
    const port = parseInt(process.env.HUXFLUX_SSH_PORT ?? "22", 10)
    const configured = !!process.env.HUXFLUX_SSH_USER
    return { host, port, user, configured }
  })
}
