import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import {
  singlePRCommentBodySchema,
  submitPRReviewBodySchema,
  replyToPRCommentBodySchema,
} from "@huxflux/shared"
import {
  createSinglePRComment,
  deleteReviewComment,
  replyToReviewComment,
  resolveReviewThread,
} from "../service/prComments.js"
import { submitPRReview } from "../service/submitReview.js"

const prParamsSchema = z.object({ owner: z.string(), repo: z.string(), number: z.string() })
const commentParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.string(),
  commentId: z.string(),
})
const ownerRepoCommentParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  commentId: z.string(),
})
const threadParamsSchema = z.object({ threadId: z.string() })

/**
 * Endpoints that post / mutate review comments and threads. Validation is
 * minimal because the heavy lifting (line snapping, fallback to issue
 * comments) happens in the service layer.
 */
export const commentsRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/prs/:owner/:repo/:number/comment — post a single review comment
  app.post(
    "/api/prs/:owner/:repo/:number/comment",
    { schema: { params: prParamsSchema, body: singlePRCommentBodySchema } },
    async (req, reply) => {
      const { owner, repo, number } = req.params
      const { body, path, line } = req.body
      if (!body.trim()) return reply.code(400).send({ error: "body is required" })
      await createSinglePRComment(owner, repo, parseInt(number, 10), body.trim(), path, line)
      return { ok: true }
    },
  )

  // POST /api/prs/:owner/:repo/:number/submit-review — submit a GitHub review
  app.post(
    "/api/prs/:owner/:repo/:number/submit-review",
    { schema: { params: prParamsSchema, body: submitPRReviewBodySchema } },
    async (req) => {
      const { owner, repo, number } = req.params
      const { event, body, comments } = req.body
      await submitPRReview(owner, repo, parseInt(number, 10), event, body, comments)
      return { ok: true }
    },
  )

  // POST /api/prs/:owner/:repo/:number/comments/:commentId/reply
  app.post(
    "/api/prs/:owner/:repo/:number/comments/:commentId/reply",
    { schema: { params: commentParamsSchema, body: replyToPRCommentBodySchema } },
    async (req, reply) => {
      const { owner, repo, number, commentId } = req.params
      const { body } = req.body
      if (!body.trim()) return reply.code(400).send({ error: "Body is required" })
      await replyToReviewComment(owner, repo, parseInt(number, 10), parseInt(commentId, 10), body.trim())
      return { ok: true }
    },
  )

  // DELETE /api/prs/:owner/:repo/comments/:commentId — delete a review comment
  app.delete(
    "/api/prs/:owner/:repo/comments/:commentId",
    { schema: { params: ownerRepoCommentParamsSchema } },
    async (req) => {
      const { owner, repo, commentId } = req.params
      await deleteReviewComment(owner, repo, parseInt(commentId, 10))
      return { ok: true }
    },
  )

  // POST /api/prs/threads/:threadId/resolve — resolve a review thread via GraphQL
  app.post(
    "/api/prs/threads/:threadId/resolve",
    { schema: { params: threadParamsSchema } },
    async (req) => {
      const { threadId } = req.params
      await resolveReviewThread(threadId)
      return { ok: true }
    },
  )
}
