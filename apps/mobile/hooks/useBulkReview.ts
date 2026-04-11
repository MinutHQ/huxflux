import { useState, useRef, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, getStorage } from "@huxflux/shared"
import type { MobilePR } from "./useMobilePRs"

export async function readSSEStream(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`Server error ${response.status}`)

  // React Native's fetch doesn't support ReadableStream — fall back to
  // reading the full response text and parsing SSE lines from it.
  const text = await response.text()
  let accumulatedContent = ""

  for (const line of text.split("\n")) {
    if (line.startsWith(":")) continue
    if (!line.startsWith("data: ")) continue
    const data = line.slice(6)
    if (data === "[DONE]") break
    try {
      const parsed = JSON.parse(data) as { text?: string; error?: string; step?: number }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.text) accumulatedContent += parsed.text
    } catch (parseErr) {
      const msg = (parseErr as Error).message
      if (!msg.startsWith("Unexpected") && !msg.startsWith("JSON")) throw parseErr
    }
  }

  return accumulatedContent
}

async function reviewSinglePR(pr: MobilePR): Promise<boolean> {
  if (!pr.repoId) return false
  const response = await api.streamPRReview(pr.repoId, pr.number)
  // Server persists the review — just consume the stream to completion
  await readSSEStream(response)
  return true
}

export function useBulkReview(onReviewDone?: (prId: string) => void) {
  const queryClient = useQueryClient()
  const storage = getStorage()
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set())
  const [concurrency, setConcurrency] = useState(() => {
    const saved = storage.getItem("huxflux:bulk-review-concurrency")
    return saved ? parseInt(saved, 10) : 5
  })
  const abortRef = useRef(false)

  const startBulkReview = useCallback(async (prs: MobilePR[]) => {
    const eligible = prs.filter((p) => p.repoId && !p.userReviewed)
    if (eligible.length === 0) return

    abortRef.current = false
    const allIds = new Set(eligible.map((p) => p.id))
    setReviewingIds(allIds)

    const queue = [...eligible]
    let completed = 0
    let failed = 0

    async function processNext(): Promise<void> {
      while (queue.length > 0 && !abortRef.current) {
        const pr = queue.shift()!
        try {
          const success = await reviewSinglePR(pr)
          if (success) {
            completed++
            // Invalidate cached chat messages so PR detail picks up the new review
            queryClient.invalidateQueries({ queryKey: ["pr-chat-messages", pr.repoId, pr.number] })
            onReviewDone?.(pr.id)
          } else {
            failed++
          }
        } catch {
          failed++
        }
        setReviewingIds((prev) => {
          const next = new Set(prev)
          next.delete(pr.id)
          return next
        })
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, eligible.length) }, () => processNext())
    await Promise.all(workers)

    setReviewingIds(new Set())
  }, [concurrency, onReviewDone])

  const cancelBulkReview = useCallback(() => {
    abortRef.current = true
    setReviewingIds(new Set())
  }, [])

  const isBulkReviewing = reviewingIds.size > 0

  return { reviewingIds, isBulkReviewing, startBulkReview, cancelBulkReview, concurrency }
}
