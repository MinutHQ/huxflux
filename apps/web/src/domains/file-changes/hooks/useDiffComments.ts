import { useCallback, useMemo, useRef, useState } from "react"
import type { PRComment } from "@huxflux/shared"
import type { CommentAnnotation } from "../file-changes.types"

interface UseDiffCommentsArgs {
  filePath: string
  pendingComments: PRComment[]
  onAddComment?: (c: PRComment) => void
}

/**
 * Owns the per-line comment-form state for `DiffView`:
 * - `commentLine` / `commentText`: the open composer (if any)
 * - `lineAnnotations`: persisted + draft annotations to feed to the pierre/diffs gutter
 * - `handleLineClick`: opens the composer when the user clicks a line gutter
 * - `submit` / `cancel`: composer actions
 */
export function useDiffComments({ filePath, pendingComments, onAddComment }: UseDiffCommentsArgs) {
  const [commentLine, setCommentLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const fileComments = useMemo(
    () => pendingComments.filter((c) => c.path === filePath && c.line),
    [pendingComments, filePath],
  )

  const lineAnnotations = useMemo(() => {
    const annotations: Array<{ side: "additions"; lineNumber: number; metadata: CommentAnnotation }> = []
    for (const c of fileComments) {
      if (c.line) {
        annotations.push({ side: "additions", lineNumber: c.line, metadata: { type: "comment", comment: c } })
      }
    }
    if (commentLine != null) {
      annotations.push({
        side: "additions",
        lineNumber: commentLine,
        metadata: { type: "comment-form", lineNumber: commentLine },
      })
    }
    return annotations.length > 0 ? annotations : undefined
  }, [fileComments, commentLine])

  const handleLineClick = useCallback(
    (props: { lineNumber: number }) => {
      if (!onAddComment) return
      setCommentLine(props.lineNumber)
      setCommentText("")
      setTimeout(() => inputRef.current?.focus(), 50)
    },
    [onAddComment],
  )

  const submit = useCallback(() => {
    if (!commentText.trim() || commentLine == null || !onAddComment) return
    onAddComment({
      id: `inline-${Date.now()}`,
      author: "You",
      body: commentText.trim(),
      createdAt: new Date().toISOString(),
      url: "",
      isReply: false,
      path: filePath,
      line: commentLine,
    })
    setCommentText("")
    setCommentLine(null)
  }, [commentText, commentLine, onAddComment, filePath])

  const cancel = useCallback(() => {
    setCommentLine(null)
    setCommentText("")
  }, [])

  return {
    commentLine,
    commentText,
    setCommentText,
    inputRef,
    lineAnnotations,
    handleLineClick,
    submit,
    cancel,
  }
}
