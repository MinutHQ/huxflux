import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { partialHuxfluxSettingsSchema } from "@huxflux/shared"
import { getSettings, saveSettings } from "./settings.service.js"

/**
 * Fastify plugin for the settings domain. Exposes the persisted
 * `HuxfluxSettings` blob (review/model defaults, polling toggles, Jira
 * credentials, etc.) via a GET + PATCH pair. The PATCH body is validated
 * against the shared Zod schema so the wire shape stays in lockstep with
 * the client.
 */
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
}
