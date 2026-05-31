import React, { useCallback, useMemo, useState } from "react"
import { cn } from "@huxflux/ui"
import { api, type FileChange, type PRComment, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { FileDiff } from "@pierre/diffs/react"
import { processFile } from "@pierre/diffs"
import type { ExpansionDirections, HunkExpansionRegion } from "@pierre/diffs/react"
import type { CommentAnnotation, PreloadedDiff } from "../file-changes.types"
import { useDiffTheme } from "../hooks/useDiffTheme"
import { useDiffComments } from "../hooks/useDiffComments"
import { DiffViewHeader } from "./DiffViewHeader"
import { InlineCommentBubble } from "./InlineCommentBubble"
import { InlineCommentForm } from "./InlineCommentForm"

interface DiffViewProps {
  agentId: string
  file: FileChange
  hideHeader?: boolean
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
  preloadedDiff?: PreloadedDiff
}

/** Syntax-highlighted unified/split diff for a single file, with optional inline comments. */
export const DiffView = React.memo(function DiffView({
  agentId,
  file,
  hideHeader,
  onAddComment,
  pendingComments = [],
  onRemoveComment,
  preloadedDiff,
}: DiffViewProps) {
  const [viewed, setViewed] = useState(false)
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified")
  const diffTheme = useDiffTheme()
  const [expandedHunks, setExpandedHunks] = useState<Map<number, HunkExpansionRegion>>(new Map())

  const fileName = file.path.split("/").pop() ?? file.path

  const { data: rawDiff } = useHuxfluxQuery({
    queryKey: queryKeys.agents.diff(agentId, file.path),
    queryFn: () => api.agents.diff(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !preloadedDiff,
  })

  const { data: newContent } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileContent(agentId, file.path),
    queryFn: () => api.agents.fileContent(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !preloadedDiff && !!rawDiff,
  })

  const { data: oldContent } = useHuxfluxQuery({
    queryKey: queryKeys.agents.baseFileContent(agentId, file.path),
    queryFn: () => api.agents.baseFileContent(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !preloadedDiff && !!rawDiff,
  })

  const effectiveDiff = preloadedDiff?.diff ?? rawDiff
  const effectiveNew = preloadedDiff?.newContent ?? newContent
  const effectiveOld = preloadedDiff?.oldContent ?? oldContent

  const fileDiff = useMemo(() => {
    if (effectiveDiff && effectiveOld !== undefined && effectiveNew !== undefined) {
      return processFile(effectiveDiff, {
        oldFile: { name: fileName, contents: effectiveOld },
        newFile: { name: fileName, contents: effectiveNew },
      })
    }
    return effectiveDiff ? processFile(effectiveDiff) : null
  }, [effectiveDiff, effectiveOld, effectiveNew, fileName])

  function onHunkExpand(hunkIndex: number, direction: ExpansionDirections, expansionLineCount = 20) {
    setExpandedHunks((prev) => {
      const next = new Map(prev)
      const region = { ...(next.get(hunkIndex) ?? { fromStart: 0, fromEnd: 0 }) }
      if (direction === "up" || direction === "both") region.fromStart += expansionLineCount
      if (direction === "down" || direction === "both") region.fromEnd += expansionLineCount
      next.set(hunkIndex, region)
      return next
    })
  }

  const comments = useDiffComments({ filePath: file.path, pendingComments, onAddComment })

  const renderAnnotation = useCallback(
    (annotation: { metadata?: CommentAnnotation }) => {
      if (!annotation.metadata) return null
      if (annotation.metadata.type === "comment") {
        return <InlineCommentBubble comment={annotation.metadata.comment} onRemoveComment={onRemoveComment} />
      }
      if (annotation.metadata.type === "comment-form") {
        return (
          <InlineCommentForm
            ref={comments.inputRef}
            fileName={fileName}
            lineNumber={annotation.metadata.lineNumber}
            text={comments.commentText}
            onChangeText={comments.setCommentText}
            onSubmit={comments.submit}
            onCancel={comments.cancel}
          />
        )
      }
      return null
    },
    [onRemoveComment, fileName, comments],
  )

  const useGutter = !!onAddComment

  const diffOptions = useMemo(
    () => ({
      theme: diffTheme,
      diffStyle,
      lineDiffType: "word" as const,
      diffIndicators: "bars" as const,
      disableFileHeader: true,
      hunkSeparators: "line-info-basic" as const,
      overflow: (hideHeader ? "wrap" : "scroll") as "wrap" | "scroll",
      expandedHunks,
      onHunkExpand,
      unsafeCSS: `pre { background-color: transparent !important; } :host { background-color: transparent !important; }`,
      ...(useGutter ? { enableGutterUtility: true, onLineClick: comments.handleLineClick } : {}),
    }),
    [diffTheme, diffStyle, expandedHunks, comments.handleLineClick, hideHeader, useGutter],
  )

  return (
    <div className={cn("flex flex-col", hideHeader ? "" : "h-full")}>
      {!hideHeader && (
        <DiffViewHeader
          filePath={file.path}
          fileName={fileName}
          diffStyle={diffStyle}
          viewed={viewed}
          rawDiff={rawDiff}
          onToggleDiffStyle={() => setDiffStyle((s) => (s === "unified" ? "split" : "unified"))}
          onToggleViewed={() => setViewed((v) => !v)}
        />
      )}

      <div className={hideHeader ? "" : "flex-1 min-h-0 overflow-auto"}>
        {fileDiff && (
          <FileDiff
            fileDiff={fileDiff}
            // pierre/diffs' option/annotation types are intentionally generic
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options={diffOptions as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            lineAnnotations={comments.lineAnnotations as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            renderAnnotation={onAddComment ? (renderAnnotation as any) : undefined}
            style={{ backgroundColor: "transparent" }}
          />
        )}
      </div>
    </div>
  )
}, (prev, next) => {
  // Only re-render if the actual diff data or view settings changed
  if (prev.file.path !== next.file.path) return false
  if (prev.hideHeader !== next.hideHeader) return false
  if (prev.preloadedDiff !== next.preloadedDiff) return false
  if (prev.agentId !== next.agentId) return false
  if (prev.pendingComments?.length !== next.pendingComments?.length) return false
  return true
})
