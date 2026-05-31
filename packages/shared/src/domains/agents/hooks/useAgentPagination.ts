import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { api } from "../../../api.js"
import { queryKeys } from "../../../queryKeys.js"
import type { Agent } from "../agents.types.js"

/**
 * Older-messages pagination for the agent detail query. The server's first
 * page response carries an initial `hasMore` flag; subsequent pages report
 * `hasMore = older.length === 50` (the API page size).
 *
 * Reads / writes the same React Query cache entry as `useAgentQuery`, so the
 * extra messages flow through `select` (sub-agent merge) on the next render.
 */
export function useAgentPagination(id: string | null, initialHasMore: boolean | undefined) {
  const queryClient = useQueryClient()
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Sync hasMore from fetched data
  useEffect(() => {
    if (initialHasMore !== undefined) {
      setHasMore(initialHasMore)
    }
  }, [initialHasMore])

  const loadMore = useCallback(async () => {
    if (!id || isLoadingMore || !hasMore) return
    const msgs = queryClient.getQueryData<Agent>(queryKeys.agents.detail(id))?.messages
    if (!msgs?.length) return
    const first = msgs[0]
    if (!first) return
    const oldest = first.timestamp
    setIsLoadingMore(true)
    try {
      const older = await api.agents.listMoreMessages(id, oldest)
      if (older.length === 0) { setHasMore(false); return }
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(id), (old) => {
        if (!old) return old
        // Deduplicate by id
        const existingIds = new Set(old.messages.map((m) => m.id))
        const newMsgs = older.filter((m) => !existingIds.has(m.id))
        return { ...old, messages: [...newMsgs, ...old.messages] }
      })
      setHasMore(older.length === 50)
    } finally {
      setIsLoadingMore(false)
    }
  }, [id, isLoadingMore, hasMore, queryClient])

  return { loadMore, hasMore, isLoadingMore }
}
