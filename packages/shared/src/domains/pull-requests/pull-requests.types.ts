// Cross-platform Zod schemas for the pull-requests domain. Consumed by the
// web PR review surface, the mobile review flow, and the agent-scoped PR
// badges. The server validates request bodies against the `*BodySchema`
// exports; the client validates responses against the entity schemas via
// `reqValidated()` in `./api.ts`.

import { z } from "zod/v4"

// ── PRStatus ─────────────────────────────────────────────────────────────────
// Cross-referenced from the agents domain via `Agent.prStatus`. The shape is
// the minimal PR-status snapshot that gets attached to an agent and broadcast
// over WS.

export const prStatusSchema = z.object({
  number: z.number(),
  url: z.string(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean(),
  draft: z.boolean(),
  mergeableState: z.string(),
  hasChangeRequests: z.boolean(),
  hasDismissedReviews: z.boolean().optional(),
})

export type PRStatus = z.infer<typeof prStatusSchema>

// ── PRReview ─────────────────────────────────────────────────────────────────

export const prReviewStateSchema = z.enum([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
])

export type PRReviewState = z.infer<typeof prReviewStateSchema>

export const prReviewSchema = z.object({
  author: z.string(),
  avatarUrl: z.string().optional(),
  state: prReviewStateSchema,
  submittedAt: z.string().optional(),
})

export type PRReview = z.infer<typeof prReviewSchema>

// ── PRCheck ──────────────────────────────────────────────────────────────────

export const prCheckStatusSchema = z.enum(["queued", "in_progress", "completed"])

export type PRCheckStatus = z.infer<typeof prCheckStatusSchema>

export const prCheckConclusionSchema = z.enum([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "neutral",
]).nullable()

export type PRCheckConclusion = z.infer<typeof prCheckConclusionSchema>

export const prCheckSchema = z.object({
  name: z.string(),
  status: prCheckStatusSchema,
  conclusion: prCheckConclusionSchema,
  url: z.string().optional(),
})

export type PRCheck = z.infer<typeof prCheckSchema>

// ── PRComment ────────────────────────────────────────────────────────────────

export const prCommentSchema = z.object({
  id: z.string(),
  databaseId: z.number().optional(),
  author: z.string(),
  avatarUrl: z.string().optional(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
  isReply: z.boolean(),
  path: z.string().optional(),
  line: z.number().optional(),
})

export type PRComment = z.infer<typeof prCommentSchema>

// ── PRThread ─────────────────────────────────────────────────────────────────

export const prThreadSchema = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  path: z.string().optional(),
  line: z.number().optional(),
  comments: z.array(prCommentSchema),
})

export type PRThread = z.infer<typeof prThreadSchema>

// ── PRIssueComment ───────────────────────────────────────────────────────────

export const prIssueCommentSchema = z.object({
  id: z.number(),
  author: z.string(),
  avatarUrl: z.string().optional(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
})

export type PRIssueComment = z.infer<typeof prIssueCommentSchema>

// ── PRDetails ────────────────────────────────────────────────────────────────
// Extends PRStatus with the full PR snapshot. Built via merge to preserve
// the shape relationship.

export const prDetailsSchema = prStatusSchema.extend({
  title: z.string(),
  body: z.string().optional(),
  author: z.string(),
  avatarUrl: z.string().optional(),
  createdAt: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
  headSha: z.string(),
  reviews: z.array(prReviewSchema),
  checks: z.array(prCheckSchema),
  threads: z.array(prThreadSchema),
  issueComments: z.array(prIssueCommentSchema),
  currentUser: z.string().optional(),
})

export type PRDetails = z.infer<typeof prDetailsSchema>

// ── OpenPR ───────────────────────────────────────────────────────────────────

export const openPRSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  authorAvatar: z.string().optional(),
  branch: z.string(),
  baseBranch: z.string(),
  body: z.string().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  createdAt: z.string(),
  hasChangeRequests: z.boolean(),
  draft: z.boolean(),
  url: z.string(),
  reviewRequested: z.boolean().optional(),
  userReviewed: z.boolean().optional(),
  isReadyToMerge: z.boolean().optional(),
  // Raw GitHub mergeable state when known.
  mergeableState: z.string().optional(),
})

export type OpenPR = z.infer<typeof openPRSchema>

export const openPRWithRepoSchema = openPRSchema.extend({
  repoId: z.string(),
  repoName: z.string(),
  agentId: z.string().optional(),
})

export type OpenPRWithRepo = z.infer<typeof openPRWithRepoSchema>

// ── PR review surface (standalone PR review page) ────────────────────────────

export const prFileStatusSchema = z.enum(["added", "modified", "deleted", "renamed"])

export type PRFileStatus = z.infer<typeof prFileStatusSchema>

export const prFileSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  status: prFileStatusSchema,
  patch: z.string().optional(),
})

export type PRFile = z.infer<typeof prFileSchema>

export const codeLineSchema = z.object({
  lineNumber: z.number(),
  content: z.string(),
  highlighted: z.boolean().optional(),
})

export type CodeLine = z.infer<typeof codeLineSchema>

export const reviewCommentSchema = z.object({
  id: z.string(),
  type: z.enum(["inline", "general"]),
  severity: z.enum(["blocking", "suggestion", "nit"]),
  path: z.string().optional(),
  line: z.number().optional(),
  // unified diff patch for this file — used by @pierre/diffs
  patch: z.string().optional(),
  codeContext: z.array(codeLineSchema).optional(),
  body: z.string(),
  status: z.enum(["pending", "queued", "dismissed", "sent"]),
  resolved: z.boolean().optional(),
})

export type ReviewComment = z.infer<typeof reviewCommentSchema>

// ── PullRequest (UI aggregate) ───────────────────────────────────────────────

export const pullRequestSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  number: z.number(),
  title: z.string(),
  repo: z.string(),
  author: z.string(),
  authorAvatar: z.string().optional(),
  branch: z.string(),
  baseBranch: z.string(),
  requestedAt: z.string(),
  reviewStatus: z.enum(["awaiting", "changes-requested", "approved"]),
  unread: z.boolean(),
  reviewReady: z.boolean().optional(),
  reviewRequested: z.boolean().optional(),
  userReviewed: z.boolean().optional(),
  isReadyToMerge: z.boolean().optional(),
  additions: z.number(),
  deletions: z.number(),
  files: z.array(prFileSchema),
  description: z.string(),
  url: z.string().optional(),
  agentId: z.string().optional(),
  checks: z.array(z.object({
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
  })).optional(),
})

export type PullRequest = z.infer<typeof pullRequestSchema>

// ── PRFileDiff (wire shape from /api/prs/.../files) ──────────────────────────

export const prFileDiffSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  status: prFileStatusSchema,
  patch: z.string().optional(),
})

export type PRFileDiff = z.infer<typeof prFileDiffSchema>

// ── Request bodies (server-validated) ────────────────────────────────────────

export const mergeMethodSchema = z.enum(["merge", "squash", "rebase"])

export type MergeMethod = z.infer<typeof mergeMethodSchema>

export const replyToPRCommentBodySchema = z.object({
  body: z.string(),
})

export type ReplyToPRCommentBody = z.infer<typeof replyToPRCommentBodySchema>

export const singlePRCommentBodySchema = z.object({
  body: z.string(),
  path: z.string().optional(),
  line: z.number().optional(),
})

export type SinglePRCommentBody = z.infer<typeof singlePRCommentBodySchema>

export const submitPRReviewBodySchema = z.object({
  event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
  body: z.string(),
  comments: z.array(z.object({
    path: z.string(),
    line: z.number(),
    body: z.string(),
    start_line: z.number().optional(),
  })),
})

export type SubmitPRReviewBody = z.infer<typeof submitPRReviewBodySchema>

export const createPRBodySchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  draft: z.boolean().optional(),
})

export type CreatePRBody = z.infer<typeof createPRBodySchema>

export const mergePRBodySchema = z.object({
  method: mergeMethodSchema.optional(),
})

export type MergePRBody = z.infer<typeof mergePRBodySchema>
