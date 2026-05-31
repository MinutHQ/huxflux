import { useMemo, useState } from "react"
import { FileDiff as PierreFileDiff } from "@pierre/diffs/react"
import type { ExpansionDirections, HunkExpansionRegion } from "@pierre/diffs/react"
import { processFile } from "@pierre/diffs"
import type { TurnFileEdit } from "../chat.types"
import { makeUnifiedDiff } from "../extract/fileEdits"

interface TurnFileDiffProps {
  filePath: string
  edits: TurnFileEdit["edits"]
  isNew: boolean
  diffTheme: "vesper" | "github-light"
  diffStyle: "unified" | "split"
}

export function TurnFileDiff({ filePath, edits, isNew, diffTheme, diffStyle }: TurnFileDiffProps) {
  const unifiedDiff = useMemo(() => makeUnifiedDiff(filePath, edits, isNew), [filePath, edits, isNew])
  const fileDiff = useMemo(() => {
    try {
      return processFile(unifiedDiff)
    } catch {
      return null
    }
  }, [unifiedDiff])
  const [expandedHunks, setExpandedHunks] = useState<Map<number, HunkExpansionRegion>>(new Map())

  if (!fileDiff) return null

  function onHunkExpand(hunkIndex: number, direction: ExpansionDirections, expansionLineCount = 20) {
    setExpandedHunks(prev => {
      const next = new Map(prev)
      const region = { ...next.get(hunkIndex) ?? { fromStart: 0, fromEnd: 0 } }
      if (direction === "up" || direction === "both") region.fromStart += expansionLineCount
      if (direction === "down" || direction === "both") region.fromEnd += expansionLineCount
      next.set(hunkIndex, region)
      return next
    })
  }

  return (
    <PierreFileDiff
      fileDiff={fileDiff}
      options={{
        theme: diffTheme,
        diffStyle,
        lineDiffType: "word",
        diffIndicators: "bars",
        disableFileHeader: true,
        hunkSeparators: "line-info",
        expandedHunks,
        onHunkExpand,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any}
    />
  )
}
