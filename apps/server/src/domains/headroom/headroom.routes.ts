import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { headroomAgentStatsSchema, headroomInstallStateSchema, headroomStatusSchema } from "@huxflux/shared"
import { getHeadroomAgentStats, getHeadroomStatus, installHeadroom } from "./headroom.service.js"

/**
 * Fastify plugin for the headroom domain. Registered via
 * `src/domains/index.ts`. The GETs never start the proxy; the runner does that
 * on the first turn of an agent with the toggle on. POST /install runs an
 * unattended CLI install (uv or pipx) and returns immediately; poll status.
 */
export const headroomPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/headroom/status", {
    schema: { response: { 200: headroomStatusSchema } },
  }, async () => getHeadroomStatus())

  app.get("/api/headroom/agents/:agentId/stats", {
    schema: {
      params: z.object({ agentId: z.string() }),
      response: { 200: headroomAgentStatsSchema },
    },
  }, async (req) => getHeadroomAgentStats(req.params.agentId))

  app.post("/api/headroom/install", {
    schema: { response: { 200: headroomInstallStateSchema } },
  }, async () => installHeadroom())
}
