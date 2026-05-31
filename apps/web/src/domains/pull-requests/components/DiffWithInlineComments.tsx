import { useEffect, useMemo, useRef } from "react"
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs"
import { PatchDiff } from "@pierre/diffs/react"
import type { PRThread } from "@huxflux/shared"
import type { DiffSlotMetadata, PendingReviewComment } from "../pull-requests.types"
import { patchToGitDiff } from "../utils"
import { useInlineCommentState } from "../hooks/useInlineCommentState"
import { InlineCommentFormSlot } from "./InlineCommentFormSlot"
import { ThreadCommentSlot } from "./ThreadCommentSlot"
import { PendingCommentSlot } from "./PendingCommentSlot"

interface DiffWithInlineCommentsProps {
  patch: string
  pendingComments: PendingReviewComment[]
  onAddComment: (line: number, body: string, startLine?: number) => void
  onRemoveComment: (id: string) => void
  onEditComment: (id: string, body: string) => void
  threads?: PRThread[]
  filePath?: string
  diffStyle: "unified" | "split"
  repoId?: string
  prNumber?: number
  currentUser?: string
  onThreadReplied?: (threadId: string, reply: PRThread["comments"][number]) => void
  onThreadResolved?: (threadId: string) => void
}

/**
 * Renders a single file's diff via `@pierre/diffs` with inline-comment
 * annotation slots overlaid on the gutter for: new-comment form, existing
 * threads, and locally-pending comments.
 */
export function DiffWithInlineComments({
  patch,
  pendingComments,
  onAddComment,
  onRemoveComment,
  onEditComment,
  threads,
  filePath,
  diffStyle,
  repoId,
  prNumber,
  currentUser,
  onThreadReplied,
  onThreadResolved,
}: DiffWithInlineCommentsProps) {
  const state = useInlineCommentState({
    threads,
    repoId,
    prNumber,
    currentUser,
    onAddComment,
    onEditComment,
    onThreadReplied,
    onThreadResolved,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diffInstanceRef = useRef<any>(null)

  const gitDiff = useMemo(() => (filePath ? patchToGitDiff(filePath, patch) : patch), [filePath, patch])

  const hasOpenForm = state.commentRange != null || state.editingId != null || state.replyingThreadId != null

  function handleGutterClick(range: SelectedLineRange) {
    state.openCommentRange(range.start, range.end)
  }

  const annotations = useMemo((): DiffLineAnnotation<DiffSlotMetadata>[] => {
    const items: DiffLineAnnotation<DiffSlotMetadata>[] = []
    for (const t of threads ?? []) {
      if (!t.line || !t.comments.length) continue
      items.push({ side: "additions", lineNumber: t.line, metadata: { id: t.id, kind: "thread" } })
    }
    for (const c of pendingComments) {
      items.push({ side: "additions", lineNumber: c.line, metadata: { id: c.id, kind: "pending" } })
    }
    if (state.commentRange) {
      items.push({
        side: "additions",
        lineNumber: state.commentRange.end,
        metadata: { id: "__form__", kind: "form" },
      })
    }
    return items
  }, [threads, pendingComments, state.commentRange])

  useEffect(() => {
    if (diffInstanceRef.current && annotations.length > 0) {
      const timer = setTimeout(() => {
        try {
          diffInstanceRef.current?.rerender()
        } catch {
          /* ignore */
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [annotations.length])

  return (
    <div className="overflow-auto rounded-b-lg">
      <PatchDiff<DiffSlotMetadata>
        patch={gitDiff}
        lineAnnotations={annotations}
        options={{
          theme: "vesper",
          diffStyle,
          lineDiffType: "word",
          diffIndicators: "bars",
          disableFileHeader: true,
          unsafeCSS: `[data-line-annotation] { overflow: hidden; min-width: 0; } [data-annotation-content] { overflow: hidden; min-width: 0; }`,
          hunkSeparators: "line-info",
          enableGutterUtility: !hasOpenForm,
          onGutterUtilityClick: handleGutterClick,
          enableLineSelection: !hasOpenForm,
          onPostRender: (_node, instance) => {
            diffInstanceRef.current = instance
          },
        }}
        renderAnnotation={(annotation) => {
          const { id, kind } = annotation.metadata

          if (kind === "form" && state.commentRange) {
            return (
              <InlineCommentFormSlot
                commentRange={state.commentRange}
                commentBody={state.commentBody}
                setCommentBody={state.setCommentBody}
                textareaRef={state.textareaRef}
                onSubmit={state.submitComment}
                onCancel={() => state.setCommentRange(null)}
              />
            )
          }

          if (kind === "thread") {
            const t = (threads ?? []).find((th) => th.id === id)
            if (!t || !t.comments.length) return null
            return (
              <ThreadCommentSlot
                thread={t}
                currentUser={currentUser}
                sending={state.sending}
                isCollapsed={state.collapsed.has(t.id)}
                isReplying={state.replyingThreadId === t.id}
                replyBody={state.replyBody}
                setReplyBody={state.setReplyBody}
                onToggleCollapse={state.toggleCollapse}
                onStartReply={(threadId) => {
                  state.setReplyingThreadId(threadId)
                  state.setReplyBody("")
                }}
                onCancelReply={() => {
                  state.setReplyingThreadId(null)
                  state.setReplyBody("")
                }}
                onSubmitReply={state.submitReply}
                onResolveThread={state.resolveThread}
                onDeleteComment={state.deleteThreadComment}
              />
            )
          }

          if (kind === "pending") {
            const c = pendingComments.find((p) => p.id === id)
            if (!c) return null
            return (
              <PendingCommentSlot
                comment={c}
                isCollapsed={state.collapsed.has(c.id)}
                isEditing={state.editingId === c.id}
                editBody={state.editBody}
                setEditBody={state.setEditBody}
                onSubmitEdit={state.submitEdit}
                onCancelEdit={() => state.setEditingId(null)}
                onToggleCollapse={state.toggleCollapse}
                onStartEdit={(commentId, body) => {
                  state.setEditingId(commentId)
                  state.setEditBody(body)
                }}
                onRemove={onRemoveComment}
              />
            )
          }

          return null
        }}
      />
    </div>
  )
}
