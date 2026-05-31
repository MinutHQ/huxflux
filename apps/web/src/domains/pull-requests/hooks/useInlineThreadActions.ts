import { api, type PRThread, useHuxfluxMutation } from "@huxflux/shared"

interface UseInlineThreadActionsArgs {
  repoId?: string
  prNumber?: number
  currentUser?: string
  onThreadReplied?: (threadId: string, reply: PRThread["comments"][number]) => void
  onThreadResolved?: (threadId: string) => void
}

/**
 * API-backed mutations for the inline-comment overlay: reply, resolve,
 * delete-my-comment. Each mutation guards on a single `sending` flag to
 * prevent concurrent calls.
 */
export function useInlineThreadActions({
  repoId,
  prNumber,
  currentUser,
  onThreadReplied,
  onThreadResolved,
}: UseInlineThreadActionsArgs) {
  const replyMut = useHuxfluxMutation<unknown, { repoId: string; prNumber: number; commentId: number; body: string }>({
    mutationFn: ({ repoId: r, prNumber: p, commentId, body }) => api.prs.replyToComment(r, p, commentId, body),
  })

  const resolveMut = useHuxfluxMutation<unknown, string>({
    mutationFn: (id) => api.prs.resolveThread(id),
  })

  const deleteMut = useHuxfluxMutation<unknown, { repoId: string; commentDatabaseId: number }>({
    mutationFn: ({ repoId: r, commentDatabaseId }) => api.prs.deleteComment(r, commentDatabaseId),
  })

  const sending = replyMut.isPending || resolveMut.isPending || deleteMut.isPending

  async function submitReply(thread: PRThread, replyBody: string): Promise<boolean> {
    if (!replyBody.trim() || sending || !repoId || !prNumber) return false
    const root = thread.comments.find((c) => !c.isReply) ?? thread.comments[0]
    if (!root?.databaseId) return false
    try {
      await replyMut.mutateAsync({ repoId, prNumber, commentId: root.databaseId, body: replyBody.trim() })
      onThreadReplied?.(thread.id, {
        id: `local-${Date.now()}`,
        author: currentUser ?? "you",
        body: replyBody.trim(),
        createdAt: new Date().toISOString(),
        url: "",
        isReply: true,
        path: thread.path,
        line: thread.line,
      })
      return true
    } catch {
      return false
    }
  }

  function resolveThread(threadId: string) {
    resolveMut.mutate(threadId, {
      onSuccess: () => onThreadResolved?.(threadId),
    })
  }

  function deleteThreadComment(commentDatabaseId: number, threadId: string) {
    if (!repoId || sending) return
    deleteMut.mutate({ repoId, commentDatabaseId }, {
      onSuccess: () => onThreadResolved?.(threadId),
    })
  }

  return { sending, submitReply, resolveThread, deleteThreadComment }
}
