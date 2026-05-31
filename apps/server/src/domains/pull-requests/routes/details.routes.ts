import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { getPRDetailsForOwnerRepo } from "../service/prDetails.js"
import { getPRFilesForOwnerRepo, getPRFileContent } from "../service/prFiles.js"

const prParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.string(),
})

const fileContentQuerySchema = z.object({
  path: z.string().optional(),
  side: z.string().optional(),
})

/**
 * Endpoints that fetch read-only PR data: changed files, raw file content at
 * either side of the diff, and the full PR details.
 */
export const detailsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/prs/:owner/:repo/:number/files — files changed in a PR with patches
  app.get(
    "/api/prs/:owner/:repo/:number/files",
    { schema: { params: prParamsSchema } },
    async (req) => {
      return getPRFilesForOwnerRepo(req.params.owner, req.params.repo, parseInt(req.params.number, 10))
    },
  )

  // GET /api/prs/:owner/:repo/:number/file-content?path=...&side=base|head — raw file content at PR ref
  app.get(
    "/api/prs/:owner/:repo/:number/file-content",
    { schema: { params: prParamsSchema, querystring: fileContentQuerySchema } },
    async (req, reply) => {
      const { owner, repo, number } = req.params
      const { path: filePath = "", side = "head" } = req.query
      if (!filePath) return reply.code(400).send({ error: "path is required" })
      const content = await getPRFileContent(owner, repo, parseInt(number, 10), filePath, side as "base" | "head")
      reply.header("Content-Type", "text/plain")
      return content
    },
  )

  // GET /api/prs/:owner/:repo/:number/details — full PR details with reviews + threads
  app.get(
    "/api/prs/:owner/:repo/:number/details",
    { schema: { params: prParamsSchema } },
    async (req) => {
      const { owner, repo, number } = req.params
      return getPRDetailsForOwnerRepo(owner, repo, parseInt(number, 10))
    },
  )
}
