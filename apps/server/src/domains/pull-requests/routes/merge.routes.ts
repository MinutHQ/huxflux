import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { mergePRBodySchema } from "@huxflux/shared"
import { getAllowedMergeMethods, mergePR } from "../service/prActions.js"

const ownerRepoParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
})

const prParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.string(),
})

/**
 * Owner/repo-addressed merge routes (used by the cross-PR merge dialog,
 * which doesn't have a local agent). The agent-scoped equivalents live in
 * `agentPr.routes.ts` and additionally update the agent row's status.
 */
export const mergeRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/prs/:owner/:repo/merge-methods — get allowed merge methods for a repo
  app.get("/api/prs/:owner/:repo/merge-methods", {
    schema: { params: ownerRepoParamsSchema },
  }, async (req) => {
    const { owner, repo } = req.params
    const methods = await getAllowedMergeMethods(`https://github.com/${owner}/${repo}`)
    return { methods }
  })

  // POST /api/prs/:owner/:repo/:number/merge — merge a PR by owner/repo/number
  app.post("/api/prs/:owner/:repo/:number/merge", {
    // The body is optional — historical clients sent no body to fall back to
    // the repo's default merge method.
    schema: { params: prParamsSchema, body: mergePRBodySchema.nullish() },
  }, async (req, reply) => {
    const { owner, repo, number } = req.params
    const prNumber = parseInt(number, 10)
    const repoUrl = `https://github.com/${owner}/${repo}`
    const body = req.body ?? {}

    try {
      await mergePR(repoUrl, prNumber, body.method)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return reply.code(400).send({ error: message })
    }

    return { ok: true, merged: true }
  })
}
