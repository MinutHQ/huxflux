import type { FastifyInstance } from "fastify"
import { config } from "../config.js"
import { createIssue } from "../github/client.js"

export async function feedbackRoutes(app: FastifyInstance) {
  app.post<{
    Body: { title: string; body?: string }
  }>("/api/feedback", async (req, reply) => {
    if (!config.feedbackRepo) {
      return reply.code(503).send({ error: "Feedback is not configured (FEEDBACK_REPO not set)" })
    }
    if (!config.githubToken) {
      return reply.code(503).send({ error: "Feedback is not configured (GITHUB_TOKEN not set)" })
    }

    const { title, body } = req.body
    if (!title?.trim()) {
      return reply.code(400).send({ error: "title is required" })
    }

    const [owner, repo] = config.feedbackRepo.split("/")
    if (!owner || !repo) {
      return reply.code(503).send({ error: "FEEDBACK_REPO must be in owner/repo format" })
    }

    const issue = await createIssue({ owner, repo, title: title.trim(), body, labels: ["feedback"] })
    return { url: issue.url, number: issue.number }
  })
}
