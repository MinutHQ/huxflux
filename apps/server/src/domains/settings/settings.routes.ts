import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { partialHuxfluxSettingsSchema, githubStatusSchema } from "@huxflux/shared"
import type { GitHubStatus } from "@huxflux/shared"
import { getSettings, saveSettings } from "./settings.service.js"
import { getOctokit } from "../pull-requests/octokit.js"
import { config } from "../../config.js"

export const settingsPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/settings", async () => getSettings())

  app.patch("/api/settings", {
    schema: { body: partialHuxfluxSettingsSchema },
  }, async (req) => {
    const body = req.body
    const current = getSettings()
    const updated = { ...current, ...body }
    saveSettings(updated)
    return updated
  })

  async function checkGithubStatus(): Promise<GitHubStatus> {
    const empty: GitHubStatus = {
      connected: false, login: null, name: null, avatarUrl: null,
      scopes: [], rateLimitRemaining: null, rateLimitTotal: null, error: null,
    }
    if (!config.githubToken) {
      return { ...empty, error: "No GitHub token configured (set GITHUB_TOKEN on the server)" }
    }
    try {
      const octokit = getOctokit()
      const { data, headers } = await octokit.users.getAuthenticated()
      const scopes = (headers["x-oauth-scopes"] ?? "")
        .split(",").map((s: string) => s.trim()).filter(Boolean)
      return {
        connected: true,
        login: data.login,
        name: data.name ?? null,
        avatarUrl: data.avatar_url ?? null,
        scopes,
        rateLimitRemaining: headers["x-ratelimit-remaining"] ? Number(headers["x-ratelimit-remaining"]) : null,
        rateLimitTotal: headers["x-ratelimit-limit"] ? Number(headers["x-ratelimit-limit"]) : null,
        error: null,
      }
    } catch (err) {
      return { ...empty, error: err instanceof Error ? err.message : "Unknown error" }
    }
  }

  app.get("/api/github/status", {
    schema: { response: { 200: githubStatusSchema } },
  }, async () => checkGithubStatus())
}
