import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import {
  generateServerIconBodySchema, generateServerIconResponseSchema, serverIconCapabilitiesSchema,
} from "@huxflux/shared"
import { generateServerIcon, isCodexAvailable, ServerIconError } from "./server-icon.service.js"

/**
 * Fastify plugin for the server-icon domain. Registered via
 * `src/domains/index.ts`. Lets a client ask this server's Codex CLI to draw
 * an SVG icon for the server switcher.
 */
export const serverIconPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/server-icon/capabilities", {
    schema: { response: { 200: serverIconCapabilitiesSchema } },
  }, async () => ({ codex: isCodexAvailable() }))

  app.post("/api/server-icon/generate", {
    schema: {
      body: generateServerIconBodySchema,
      response: {
        200: generateServerIconResponseSchema,
        429: z.object({ error: z.string() }),
        502: z.object({ error: z.string() }),
        503: z.object({ error: z.string() }),
      },
    },
  }, async (req, reply) => {
    try {
      return await generateServerIcon(req.body.description)
    } catch (err) {
      if (err instanceof ServerIconError) return reply.code(err.statusCode).send({ error: err.message })
      throw err
    }
  })
}
