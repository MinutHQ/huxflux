import type { FastifyReply } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { feedbackRequestSchema, type FeedbackRequest } from "@huxflux/shared"
import { config } from "../../config.js"
import { createIssue } from "../pull-requests/misc.js"

/**
 * Fastify plugin for the feedback domain. Exposes a single POST that maps
 * user-submitted feedback to a GitHub issue in the configured
 * `FEEDBACK_REPO`. Requires both `FEEDBACK_REPO` and `GITHUB_TOKEN`.
 */
export const feedbackPlugin: FastifyPluginAsyncZod = async (app) => {
  await app.register(feedbackRoutes)
}

const feedbackRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/api/feedback", {
    schema: { body: feedbackRequestSchema },
  }, async (req, reply) => {
    return feedbackHandler(req.body, reply)
  })
}

async function feedbackHandler(body: FeedbackRequest, reply: FastifyReply): Promise<unknown> {
  if (!config.feedbackRepo) {
    return reply.code(503).send({ error: "Feedback is not configured (FEEDBACK_REPO not set)" })
  }
  if (!config.githubToken) {
    return reply.code(503).send({ error: "Feedback is not configured (GITHUB_TOKEN not set)" })
  }

  const { title, body: issueBody } = body
  if (!title?.trim()) {
    return reply.code(400).send({ error: "title is required" })
  }

  const [owner, repo] = config.feedbackRepo.split("/")
  if (!owner || !repo) {
    return reply.code(503).send({ error: "FEEDBACK_REPO must be in owner/repo format" })
  }

  const issue = await createIssue({ owner, repo, title: title.trim(), body: issueBody, labels: ["feedback"] })
  return { url: issue.url, number: issue.number }
}
