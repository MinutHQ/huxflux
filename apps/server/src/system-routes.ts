import type { FastifyInstance } from "fastify"
import * as os from "node:os"
import { getVersionInfo, checkForUpdate, triggerServerUpdate } from "./updater.js"
import { selectAndroidRelease, type AndroidRelease, type GithubRelease } from "@huxflux/shared"
import { config } from "./config.js"
import { getSettings } from "./domains/settings/settings.service.js"

const GITHUB_REPO = "MinutHQ/huxflux"
// Phones poll this endpoint; caching keeps the server well under GitHub's
// unauthenticated rate limit no matter how many devices are connected.
const ANDROID_RELEASE_TTL_MS = 10 * 60 * 1000

const androidReleaseCache = new Map<string, { at: number; release: AndroidRelease | null }>()

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "huxflux-server",
  }
  if (config.githubToken) headers["Authorization"] = `Bearer ${config.githubToken}`
  return headers
}

async function loadAndroidRelease(channel: "stable" | "beta"): Promise<AndroidRelease | null> {
  const cached = androidReleaseCache.get(channel)
  if (cached && Date.now() - cached.at < ANDROID_RELEASE_TTL_MS) return cached.release
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, { headers: githubHeaders() })
  if (!res.ok) return cached?.release ?? null
  const release = selectAndroidRelease(await res.json() as GithubRelease[], channel)
  androidReleaseCache.set(channel, { at: Date.now(), release })
  return release
}

export async function systemRoutes(app: FastifyInstance) {
  app.get("/api/system/latest-beta-tag", async () => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`
    const res = await fetch(url, { headers: githubHeaders() })
    if (!res.ok) return { tag: null }
    const releases = await res.json() as { prerelease?: boolean; draft?: boolean; tag_name?: string; assets?: { name?: string }[] }[]
    for (const r of releases) {
      // Skip prereleases without a desktop manifest (a release still uploading,
      // or one whose desktop build failed): the updater would 404 on them.
      const hasManifest = r.assets?.some((a) => a.name === "latest-beta.json") ?? false
      if (r.prerelease && !r.draft && hasManifest) {
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

  // Newest Android APK on the server's update channel, for the app's in-app updater
  app.get("/api/system/android-update", async () => {
    const channel = getSettings().updateChannel === "beta" ? "beta" : "stable"
    const release = await loadAndroidRelease(channel).catch(() => null)
    return { version: release?.version ?? null, url: release?.url ?? null }
  })

  // Returns current and latest server version
  app.get("/api/system/version", async () => {
    return getVersionInfo()
  })

  // Force a version check against npm registry
  app.post("/api/system/version/check", async () => {
    return checkForUpdate()
  })

  // Start a server update (npm install + restart). `npm install -g` routinely
  // outlives a client request timeout, so the install runs in the background
  // and clients poll /api/system/version (updateInProgress, updateError).
  app.post("/api/system/update", async (_req, reply) => {
    const info = getVersionInfo()
    if (!info.updateAvailable && !info.updateInProgress) {
      return reply.status(400).send({ error: "No update available" })
    }
    void triggerServerUpdate()
    return reply.status(202).send({ success: true, message: "Update started" })
  })
}
