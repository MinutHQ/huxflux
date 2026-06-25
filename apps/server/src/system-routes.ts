import type { FastifyInstance } from "fastify"
import * as os from "node:os"
import { getVersionInfo, checkForUpdate, triggerServerUpdate } from "./updater.js"
import { config } from "./config.js"

const GITHUB_REPO = "MinutHQ/huxflux"

export async function systemRoutes(app: FastifyInstance) {
  app.get("/api/system/latest-beta-tag", async () => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "huxflux-server",
    }
    if (config.githubToken) {
      headers["Authorization"] = `Bearer ${config.githubToken}`
    }
    const res = await fetch(url, { headers })
    if (!res.ok) return { tag: null }
    const releases = await res.json() as { prerelease?: boolean; draft?: boolean; tag_name?: string }[]
    for (const r of releases) {
      if (r.prerelease && !r.draft) {
        return { tag: r.tag_name ?? null }
      }
    }
    return { tag: null }
  })
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
