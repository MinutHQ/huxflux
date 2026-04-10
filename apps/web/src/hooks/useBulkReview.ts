import { useState, useRef, useCallback } from "react"
import { api } from "@huxflux/shared"
import type { PullRequest, ReviewComment } from "@/data/mockReviews"
import { toast } from "sonner"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref, getDesktopNotif } from "@/lib/notificationPrefs"

function parseReviewJson(text: string): { summary: string; verdict: string; comments: any[] } | null {
  const matches = [...text.matchAll(/```json\s*\n([\s\S]+?)\n```/g)]
  if (matches.length === 0) return null
  try {
    const data = JSON.parse(matches[matches.length - 1][1])
    if (typeof data.summary !== "string" || !Array.isArray(data.comments)) return null
    return data
  } catch { return null }
}

function saveReviewCache(repoId: string, prNumber: number, review: { content: string; verdict?: string; comments: ReviewComment[]; timestamp: string }) {
  const key = `huxflux:review:${repoId}:${prNumber}`
  try {
    const raw = localStorage.getItem(key)
    let existing: Array<typeof review> = []
    if (raw) {
      try {
        const data = JSON.parse(raw) as { reviews?: typeof existing }
        if (data.reviews && Array.isArray(data.reviews)) existing = data.reviews
      } catch { /* start fresh */ }
    }
    existing.push(review)
    localStorage.setItem(key, JSON.stringify({ reviews: existing }))
  } catch { /* storage full */ }
}

async function reviewSinglePR(pr: PullRequest, model?: string): Promise<boolean> {
  if (!pr.repoId) return false

  const response = await api.streamPRReview(pr.repoId, pr.number, undefined, model)
  if (!response.ok) throw new Error(`Server error ${response.status}`)
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let done = false
  let accumulatedContent = ""

  while (!done) {
    const chunk = await reader.read()
    if (chunk.done) break
    buf += decoder.decode(chunk.value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (line.startsWith(":")) continue
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6)
      if (data === "[DONE]") { done = true; break }
      try {
        const parsed = JSON.parse(data) as { text?: string; error?: string; step?: number }
        if (parsed.error) throw new Error(parsed.error)
        if (parsed.text) accumulatedContent += parsed.text
      } catch (parseErr) {
        const msg = (parseErr as Error).message
        if (!msg.startsWith("Unexpected") && !msg.startsWith("JSON")) throw parseErr
      }
    }
  }

  const reviewData = parseReviewJson(accumulatedContent)
  if (reviewData) {
    const comments: ReviewComment[] = (reviewData.comments as any[]).map((c, i) => ({
      id: `ai-${i}`,
      type: (c.type === "inline" && c.path) ? "inline" : "general" as const,
      severity: (["blocking", "suggestion", "nit"].includes(c.severity) ? c.severity : "suggestion") as ReviewComment["severity"],
      path: c.path,
      line: c.line,
      body: c.body ?? "",
      status: "pending" as const,
    }))

    saveReviewCache(pr.repoId, pr.number, {
      content: reviewData.summary,
      verdict: (["approve", "request_changes", "comment"].includes(reviewData.verdict) ? reviewData.verdict : "comment"),
      comments,
      timestamp: new Date().toISOString(),
    })
    return true
  }
  return false
}

export function useBulkReview(onReviewDone?: (prId: string) => void) {
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set())
  const [concurrency, setConcurrency] = useState(() => {
    const saved = localStorage.getItem("huxflux:bulk-review-concurrency")
    return saved ? parseInt(saved, 10) : 5
  })
  const abortRef = useRef(false)

  const updateConcurrency = useCallback((n: number) => {
    setConcurrency(n)
    localStorage.setItem("huxflux:bulk-review-concurrency", String(n))
  }, [])

  const startBulkReview = useCallback(async (prs: PullRequest[], model?: string) => {
    const reviewable = prs.filter((p) => p.repoId && !p.userReviewed)
    let eligible = reviewable.filter((p) => {
      const cached = localStorage.getItem(`huxflux:review:${p.repoId}:${p.number}`)
      return !cached
    })

    // All reviewable PRs already have cached reviews — re-run them all
    if (eligible.length === 0 && reviewable.length > 0) {
      for (const p of reviewable) {
        localStorage.removeItem(`huxflux:review:${p.repoId}:${p.number}`)
      }
      eligible = reviewable
    }

    if (eligible.length === 0) {
      toast.info("No PRs to review")
      return
    }

    abortRef.current = false
    const allIds = new Set(eligible.map((p) => p.id))
    setReviewingIds(allIds)

    toast.info(`Starting review of ${eligible.length} PR${eligible.length !== 1 ? "s" : ""}`)

    // Process with concurrency limit
    const queue = [...eligible]
    let completed = 0
    let failed = 0

    async function processNext(): Promise<void> {
      while (queue.length > 0 && !abortRef.current) {
        const pr = queue.shift()!
        try {
          const success = await reviewSinglePR(pr, model)
          if (success) {
            completed++
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

    if (!abortRef.current) {
      const desc = failed > 0 ? `${completed} done, ${failed} failed` : `${completed} reviewed`
      toast.success(`Bulk review complete`, { description: desc })
      if (getSoundEnabled()) playSound(getSoundPref())
      if (getDesktopNotif() && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Bulk review complete", { body: desc })
      }
    }

    setReviewingIds(new Set())
  }, [concurrency, onReviewDone])

  const cancelBulkReview = useCallback(() => {
    abortRef.current = true
    setReviewingIds(new Set())
    toast.info("Bulk review cancelled")
  }, [])

  const isBulkReviewing = reviewingIds.size > 0

  return { reviewingIds, isBulkReviewing, startBulkReview, cancelBulkReview, concurrency, updateConcurrency }
}
