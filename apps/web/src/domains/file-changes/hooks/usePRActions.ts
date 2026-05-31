import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, type Agent, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import type { MergeMethod } from "../file-changes.types"

/**
 * Mutation helpers for the agent PR tab (mark ready / merge / resolve thread /
 * reply / re-request review). Owns the per-action submitting flags too.
 */
export function usePRActions(agentId: string) {
  const queryClient = useQueryClient()

  const markReadyMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.markReady(agentId),
    invalidate: () => [queryKeys.prs.details(agentId), queryKeys.agents.detail(agentId)],
    onSuccess: () => toast.success("PR marked ready for review"),
    onError: (err) => toast.error(`Failed to mark ready: ${err instanceof Error ? err.message : "unknown error"}`),
  })

  const mergeMut = useHuxfluxMutation<unknown, MergeMethod>({
    mutationFn: (method) => api.prs.merge(agentId, method),
    invalidate: () => [queryKeys.prs.details(agentId), queryKeys.agents.detail(agentId)],
    onSuccess: () => toast.success("PR merged"),
    onError: (err) => toast.error(`Merge failed: ${err instanceof Error ? err.message : "unknown error"}`),
  })

  const resolveMut = useHuxfluxMutation<unknown, string>({
    mutationFn: (threadId) => api.prs.resolveThread(threadId),
    invalidate: () => queryKeys.prs.details(agentId),
    onSuccess: () => toast.success("Thread resolved"),
    onError: (err) => toast.error(`Failed to resolve: ${err instanceof Error ? err.message : "unknown error"}`),
  })

  const replyMut = useHuxfluxMutation<unknown, { commentId: number; body: string }>({
    mutationFn: ({ commentId, body }) => {
      const agent = queryClient.getQueryData<Agent>(queryKeys.agents.detail(agentId))
      if (!agent?.repoId || !agent?.prNumber) throw new Error("No PR info")
      return api.prs.replyToComment(agent.repoId, agent.prNumber, commentId, body)
    },
    invalidate: () => queryKeys.prs.details(agentId),
  })

  const rerequestMut = useHuxfluxMutation<unknown, string>({
    mutationFn: () => api.prs.rerequestReview(agentId),
    invalidate: () => queryKeys.prs.details(agentId),
    onSuccess: (_data, author) => toast.success(`Re-requested review from ${author}`),
    onError: () => toast.error("Failed to re-request"),
  })

  const markReady = () => markReadyMut.mutate()
  const merge = (method: MergeMethod) => mergeMut.mutate(method)
  const resolveThread = (threadId: string) => resolveMut.mutate(threadId)
  const replyToComment = async (commentId: number, body: string): Promise<void> => {
    await replyMut.mutateAsync({ commentId, body })
  }
  const rerequestReview = (author: string) => rerequestMut.mutate(author)

  return {
    markingReady: markReadyMut.isPending,
    merging: mergeMut.isPending,
    markReady,
    merge,
    resolveThread,
    replyToComment,
    rerequestReview,
  }
}
