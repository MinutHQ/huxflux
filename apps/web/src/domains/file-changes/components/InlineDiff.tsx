import React from "react"
import type { FileChange, PRComment } from "@huxflux/shared"
import type { PreloadedDiff } from "../file-changes.types"
import { DiffView } from "./DiffView"

interface InlineDiffProps {
  diffData: PreloadedDiff
  file: FileChange
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}

/** Single-file inline diff rendered inside the stacked diff list, using pre-fetched data. */
export const InlineDiff = React.memo(function InlineDiff({
  diffData,
  file,
  onAddComment,
  pendingComments,
  onRemoveComment,
}: InlineDiffProps) {
  return (
    <DiffView
      agentId=""
      file={file}
      hideHeader
      onAddComment={onAddComment}
      pendingComments={pendingComments}
      onRemoveComment={onRemoveComment}
      preloadedDiff={diffData}
    />
  )
})
