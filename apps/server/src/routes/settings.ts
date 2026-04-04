import type { FastifyInstance } from "fastify"
import { getSettings, saveSettings, type HiveSettings } from "../settings.js"

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => getSettings())

  app.patch<{ Body: Partial<HiveSettings> }>("/api/settings", async (req) => {
    const current = getSettings()
    const updated = { ...current, ...req.body }
    saveSettings(updated)
    return updated
  })
}
