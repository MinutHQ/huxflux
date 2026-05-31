import { z } from "zod/v4"
import { reqValidated, req, getApiBase, authHeaders } from "../../apiBase.js"
import {
  openPRWithRepoSchema,
  prDetailsSchema,
  prFileDiffSchema,
  prStatusSchema,
  mergeMethodSchema,
  replyToPRCommentBodySchema,
  singlePRCommentBodySchema,
  submitPRReviewBodySchema,
  createPRBodySchema,
  mergePRBodySchema,
  type MergeMethod,
  type SubmitPRReviewBody,
  type CreatePRBody,
} from "./pull-requests.types.js"

const okResponseSchema = z.object({ ok: z.boolean() })
const mergeMethodsResponseSchema = z.object({ methods: z.array(mergeMethodSchema) })

export const prsApi = {
  // GitHub / PR (repo-scoped, repoId is "owner/repo")
  list: () => reqValidated(z.array(openPRWithRepoSchema), "/api/prs"),
  files: (repoId: string, number: number) => {
    const [owner, repo] = repoId.split("/")
    return reqValidated(z.array(prFileDiffSchema), `/api/prs/${owner}/${repo}/${number}/files`)
  },
  detailsForRepo: (repoId: string, number: number) => {
    const [owner, repo] = repoId.split("/")
    return reqValidated(prDetailsSchema, `/api/prs/${owner}/${repo}/${number}/details`)
  },
  fileContent: (repoId: string, number: number, filePath: string, side: "base" | "head") => {
    const [owner, repo] = repoId.split("/")
    return fetch(`${getApiBase()}/api/prs/${owner}/${repo}/${number}/file-content?path=${encodeURIComponent(filePath)}&side=${side}`, { headers: authHeaders() }).then((r) => r.text())
  },
  resolveThread: (threadId: string) =>
    reqValidated(okResponseSchema, `/api/prs/threads/${encodeURIComponent(threadId)}/resolve`, { method: "POST" }),
  deleteComment: (repoId: string, commentId: number) => {
    const [owner, repo] = repoId.split("/")
    return reqValidated(okResponseSchema, `/api/prs/${owner}/${repo}/comments/${commentId}`, { method: "DELETE" })
  },
  replyToComment: (repoId: string, prNumber: number, commentId: number, body: string) => {
    const [owner, repo] = repoId.split("/")
    return reqValidated(okResponseSchema, `/api/prs/${owner}/${repo}/${prNumber}/comments/${commentId}/reply`, {
      method: "POST",
      body: JSON.stringify(replyToPRCommentBodySchema.parse({ body })),
    })
  },
  submitReview: (
    repoId: string,
    prNumber: number,
    body: SubmitPRReviewBody,
  ) => {
    const [owner, repo] = repoId.split("/")
    return reqValidated(okResponseSchema, `/api/prs/${owner}/${repo}/${prNumber}/submit-review`, {
      method: "POST",
      body: JSON.stringify(submitPRReviewBodySchema.parse(body)),
    })
  },
  sendSingleComment: (repoId: string, prNumber: number, body: string, path?: string, line?: number) => {
    const [owner, repo] = repoId.split("/")
    return reqValidated(okResponseSchema, `/api/prs/${owner}/${repo}/${prNumber}/comment`, {
      method: "POST",
      body: JSON.stringify(singlePRCommentBodySchema.parse({ body, path, line })),
    })
  },

  // GitHub / PR (agent-scoped)
  details: (agentId: string) => reqValidated(prDetailsSchema, `/api/agents/${agentId}/pr/details`),
  create: (agentId: string, body: CreatePRBody) =>
    reqValidated(prStatusSchema, `/api/agents/${agentId}/pr`, {
      method: "POST",
      body: JSON.stringify(createPRBodySchema.parse(body)),
    }),
  markReady: (agentId: string) =>
    reqValidated(prStatusSchema, `/api/agents/${agentId}/pr/ready`, { method: "PUT" }),
  rerequestReview: (agentId: string) =>
    reqValidated(prStatusSchema, `/api/agents/${agentId}/pr/rerequest-review`, { method: "POST" }),
  merge: (agentId: string, method?: MergeMethod) =>
    reqValidated(prStatusSchema, `/api/agents/${agentId}/pr/merge`, {
      method: "POST",
      body: JSON.stringify(mergePRBodySchema.parse({ method })),
    }),
  mergeMethods: (repoId: string) => {
    const [owner, repo] = repoId.split("/")
    return reqValidated(mergeMethodsResponseSchema, `/api/prs/${owner}/${repo}/merge-methods`)
  },
  mergeByRepo: (repoId: string, prNumber: number, method?: MergeMethod) => {
    const [owner, repo] = repoId.split("/")
    // Server responds with { ok, merged }; only `ok` matters to callers.
    return req<{ ok: boolean }>(`/api/prs/${owner}/${repo}/${prNumber}/merge`, {
      method: "POST",
      body: JSON.stringify(mergePRBodySchema.parse({ method })),
    })
  },
}
