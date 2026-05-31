import { useRef, useState } from "react"
import type { PRThread } from "@huxflux/shared"
import { useInlineThreadActions } from "./useInlineThreadActions"
import { useCollapsedSet } from "./useCollapsedSet"

interface UseInlineCommentStateArgs {
  threads?: PRThread[]
  repoId?: string
  prNumber?: number
  currentUser?: string
  onAddComment: (line: number, body: string, startLine?: number) => void
  onEditComment: (id: string, body: string) => void
  onThreadReplied?: (threadId: string, reply: PRThread["comments"][number]) => void
  onThreadResolved?: (threadId: string) => void
}

/**
 * State machine for the inline-comment overlay on a single file's diff. Owns
 * the form/edit/reply mode flags and delegates persisted-thread mutations to
 * `useInlineThreadActions` and collapsed-id tracking to `useCollapsedSet`.
 */
export function useInlineCommentState({
  threads,
  repoId,
  prNumber,
  currentUser,
  onAddComment,
  onEditComment,
  onThreadReplied,
  onThreadResolved,
}: UseInlineCommentStateArgs) {
  const [commentRange, setCommentRange] = useState<{ start: number; end: number } | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [replyingThreadId, setReplyingThreadId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const { collapsed, toggle: toggleCollapse } = useCollapsedSet(threads)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const actions = useInlineThreadActions({
    repoId,
    prNumber,
    currentUser,
    onThreadReplied,
    onThreadResolved,
  })

  function openCommentRange(start: number, end: number) {
    setCommentRange({ start, end })
    setCommentBody("")
    setEditingId(null)
    setReplyingThreadId(null)
    setTimeout(() => textareaRef.current?.focus(), 80)
  }

  function submitComment() {
    if (!commentBody.trim() || !commentRange) return
    const startLine = commentRange.start !== commentRange.end ? commentRange.start : undefined
    onAddComment(commentRange.end, commentBody.trim(), startLine)
    setCommentRange(null)
    setCommentBody("")
  }

  function submitEdit() {
    if (!editBody.trim() || !editingId) return
    onEditComment(editingId, editBody.trim())
    setEditingId(null)
    setEditBody("")
  }

  async function submitReply(thread: PRThread) {
    const ok = await actions.submitReply(thread, replyBody)
    if (ok) {
      setReplyBody("")
      setReplyingThreadId(null)
    }
  }

  return {
    commentRange,
    commentBody,
    setCommentBody,
    setCommentRange,
    editingId,
    setEditingId,
    editBody,
    setEditBody,
    replyingThreadId,
    setReplyingThreadId,
    replyBody,
    setReplyBody,
    sending: actions.sending,
    collapsed,
    textareaRef,
    toggleCollapse,
    openCommentRange,
    submitComment,
    submitEdit,
    submitReply,
    resolveThread: actions.resolveThread,
    deleteThreadComment: actions.deleteThreadComment,
  }
}
