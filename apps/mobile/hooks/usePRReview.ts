import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type PRFileDiff } from "@huxflux/shared"
import type { ReviewComment, CodeLine } from "../components/ReviewCommentCard"
import { readSSEStream } from "./useBulkReview"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  isReview: boolean
  comments?: ReviewComment[]
}

function parseReviewJson(text: string): { summary: string; verdict: string; comments: any[] } | null {
  const matches = [...text.matchAll(/```json\s*\n([\s\S]+?)\n```/g)]
  if (matches.length === 0) return null
  try {
    const data = JSON.parse(matches[matches.length - 1][1])
    if (typeof data.summary !== "string" || !Array.isArray(data.comments)) return null
    return data
  } catch { return null }
}

function buildCodeContext(patch: string, targetLine: number): CodeLine[] {
  if (!patch) return []
  const lines = patch.split("\n")
  let newLineNum = 0
  const allLines: { lineNumber: number; content: string }[] = []
  for (const line of lines) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (m) { newLineNum = parseInt(m[1], 10) - 1; continue }
    if (line.startsWith("-")) continue
    if (line.startsWith("+") || line.startsWith(" ")) {
      newLineNum++
      allLines.push({ lineNumber: newLineNum, content: line.slice(1) })
    }
  }
  const idx = allLines.findIndex((l) => l.lineNumber === targetLine)
  if (idx === -1) return []
  const start = Math.max(0, idx - 3)
  const end = Math.min(allLines.length - 1, idx + 3)
  return allLines.slice(start, end + 1).map((l) => ({ ...l, highlighted: l.lineNumber === targetLine }))
}

function addCodeContext(comments: ReviewComment[], patches: Record<string, string>): ReviewComment[] {
  return comments.map((c) => ({
    ...c,
    codeContext: c.path && c.line ? buildCodeContext(patches[c.path] ?? "", c.line) : undefined,
  }))
}

function convertServerMessage(
  m: { id: string; role: string; content: string; isReview: boolean; createdAt: string },
  patches: Record<string, string>,
): ChatMessage {
  if (m.isReview) {
    const reviewData = parseReviewJson(m.content)
    if (reviewData) {
      const summaryText = m.content.replace(/```json[\s\S]+?```\s*$/m, "").trim()
      const comments: ReviewComment[] = addCodeContext(
        (reviewData.comments as any[]).map((c, i) => ({
          id: `db-ai-${i}-${m.id}`,
          type: (c.type === "inline" && c.path) ? "inline" : "general" as const,
          severity: (["blocking", "suggestion", "nit"].includes(c.severity) ? c.severity : "suggestion") as ReviewComment["severity"],
          path: c.path,
          line: c.line,
          body: c.body ?? "",
          status: "pending" as const,
        })),
        patches,
      )
      return {
        id: m.id,
        role: "assistant",
        content: reviewData.summary || summaryText,
        isReview: true,
        comments,
      }
    }
  }
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    isReview: m.isReview,
  }
}

function filterToLatestRound(converted: ChatMessage[]): ChatMessage[] {
  const lastReviewIdx = converted.findLastIndex((m) => m.isReview && m.comments && m.comments.length > 0)
  const slice = lastReviewIdx >= 0 ? converted.slice(lastReviewIdx) : converted
  return slice.filter((m) => !m.isReview || (m.comments && m.comments.length > 0))
}

export function usePRReview(repoId: string, prNumber: number) {
  const queryClient = useQueryClient()
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // Fetch file patches
  const { data: prFiles } = useQuery({
    queryKey: ["pr-files", repoId, prNumber],
    queryFn: () => api.getPRFiles(repoId, prNumber),
    enabled: !!repoId && prNumber > 0,
    staleTime: 60_000,
  })

  const patches = useMemo(() => {
    if (!prFiles) return {} as Record<string, string>
    const map: Record<string, string> = {}
    for (const f of prFiles) {
      if (f.patch) map[f.path] = f.patch
    }
    return map
  }, [prFiles])

  // Keep ref for use in callbacks
  const patchesRef = useRef(patches)
  useEffect(() => { patchesRef.current = patches }, [patches])

  // Fetch review messages from server
  const { data: serverMessages, isLoading } = useQuery({
    queryKey: ["pr-chat-messages", repoId, prNumber],
    queryFn: () => api.getPRChatMessages(repoId, prNumber),
    enabled: !!repoId && prNumber > 0,
    staleTime: 10_000,
  })

  // Convert and filter server messages — computed during render so updates are immediate
  const serverConverted = useMemo(() => {
    if (!serverMessages || serverMessages.length === 0) return []
    const converted = serverMessages.map((m) => convertServerMessage(m, patches))
    return filterToLatestRound(converted)
  }, [serverMessages, patches])

  // Track the head SHA the latest review was based on
  const reviewHeadSha = useMemo(() => {
    if (!serverMessages) return undefined
    const lastReview = [...serverMessages].reverse().find((m) => m.isReview)
    return lastReview?.reviewHeadSha
  }, [serverMessages])

  const messages = localMessages.length > 0 ? localMessages : serverConverted
  const hasReviewed = messages.some((m) => m.isReview && m.comments && m.comments.length > 0)
  const loaded = !isLoading

  const triggerReview = useCallback(async () => {
    setReviewing(true)
    try {
      const response = await api.streamPRReview(repoId, prNumber)
      const content = await readSSEStream(response)
      const reviewData = parseReviewJson(content)

      if (reviewData) {
        const comments: ReviewComment[] = addCodeContext(
          (reviewData.comments as any[]).map((c, i) => ({
            id: `ai-${Date.now()}-${i}`,
            type: (c.type === "inline" && c.path) ? "inline" : "general" as const,
            severity: (["blocking", "suggestion", "nit"].includes(c.severity) ? c.severity : "suggestion") as ReviewComment["severity"],
            path: c.path,
            line: c.line,
            body: c.body ?? "",
            status: "pending" as const,
          })),
          patchesRef.current,
        )

        const msg: ChatMessage = {
          id: `review-${Date.now()}`,
          role: "assistant",
          content: reviewData.summary,
          isReview: true,
          comments,
        }
        setLocalMessages((prev) => [...prev, msg])
      }
      queryClient.invalidateQueries({ queryKey: ["pr-chat-messages", repoId, prNumber] })
    } catch (err: any) {
      setLocalMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Review failed: ${err.message}`,
        isReview: false,
      }])
    } finally {
      setReviewing(false)
    }
  }, [repoId, prNumber, queryClient])

  const sendChat = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      isReview: false,
    }
    setLocalMessages((prev) => {
      const base = prev.length > 0 ? prev : serverConverted
      return [...base, userMsg]
    })
    setIsSending(true)

    try {
      const currentMsgs = localMessages.length > 0 ? localMessages : serverConverted
      const chatMessages = currentMsgs
        .filter((m) => !m.isReview)
        .map((m) => ({ role: m.role, content: m.content }))
      chatMessages.push({ role: "user" as const, content: text })

      const response = await api.streamPRChat(repoId, prNumber, chatMessages)
      const content = await readSSEStream(response)

      setLocalMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content,
        isReview: false,
      }])
      queryClient.invalidateQueries({ queryKey: ["pr-chat-messages", repoId, prNumber] })
    } catch (err: any) {
      setLocalMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Error: ${err.message}`,
        isReview: false,
      }])
    } finally {
      setIsSending(false)
    }
  }, [repoId, prNumber, localMessages, serverConverted, queryClient])

  const updateCommentStatus = useCallback((commentId: string, status: ReviewComment["status"]) => {
    const updater = (msgs: ChatMessage[]) => msgs.map((msg) => {
      if (!msg.comments) return msg
      return {
        ...msg,
        comments: msg.comments.map((c) => c.id === commentId ? { ...c, status } : c),
      }
    })
    if (localMessages.length > 0) {
      setLocalMessages(updater)
    } else {
      setLocalMessages(updater(serverConverted))
    }
  }, [localMessages, serverConverted])

  return {
    messages,
    reviewing,
    isSending,
    hasReviewed,
    loaded,
    reviewHeadSha,
    triggerReview,
    sendChat,
    updateCommentStatus,
  }
}
