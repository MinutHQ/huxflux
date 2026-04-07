import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import type { FileChange } from "@/data/mock"
import { api } from "@huxflux/shared"
import { IconCopy, IconEye, IconLayoutColumns, IconLayoutRows } from "@tabler/icons-react"
import { FileDiff } from "@pierre/diffs/react"
import { processFile } from "@pierre/diffs"
import type { ExpansionDirections, HunkExpansionRegion } from "@pierre/diffs/react"

// ── Main component ────────────────────────────────────────────────────────────

export function DiffView({ agentId, file }: { agentId: string; file: FileChange }) {
  const [viewed, setViewed] = useState(false)
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified")
  const scrollRef = useRef<HTMLDivElement>(null)

  // When hunk expansion inserts rows, the viewport scrolls up before any
  // ResizeObserver or rAF can fire. Intercept scroll events directly and reset
  // synchronously within a short window after each click.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    let savedScroll: number | null = null
    let clearTimer: ReturnType<typeof setTimeout> | null = null
    let inReset = false

    const onScroll = () => {
      if (savedScroll !== null && !inReset) {
        inReset = true
        container.scrollTop = savedScroll
        inReset = false
      }
    }

    const onClickCapture = () => {
      savedScroll = container.scrollTop
      if (clearTimer) clearTimeout(clearTimer)
      clearTimer = setTimeout(() => {
        savedScroll = null
        clearTimer = null
      }, 600)
    }

    container.addEventListener("click", onClickCapture, true)
    container.addEventListener("scroll", onScroll)

    return () => {
      container.removeEventListener("click", onClickCapture, true)
      container.removeEventListener("scroll", onScroll)
      if (clearTimer) clearTimeout(clearTimer)
    }
  }, [])
  const [expandedHunks, setExpandedHunks] = useState<Map<number, HunkExpansionRegion>>(new Map())

  const fileName = file.path.split("/").pop() ?? file.path

  const { data: rawDiff } = useQuery({
    queryKey: ["diff", agentId, file.path],
    queryFn: () => api.getDiff(agentId, file.path),
    staleTime: 30_000,
  })

  const { data: newContent } = useQuery({
    queryKey: ["file-content", agentId, file.path],
    queryFn: () => api.getFileContent(agentId, file.path),
    staleTime: 30_000,
    enabled: !!rawDiff,
  })

  const { data: oldContent } = useQuery({
    queryKey: ["file-base-content", agentId, file.path],
    queryFn: () => api.getBaseFileContent(agentId, file.path),
    staleTime: 30_000,
    enabled: !!rawDiff,
  })

  const fileDiff = rawDiff && oldContent !== undefined && newContent !== undefined
    ? processFile(rawDiff, {
        oldFile: { name: fileName, contents: oldContent },
        newFile: { name: fileName, contents: newContent },
      })
    : rawDiff
      ? processFile(rawDiff)
      : null

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
    <div className="flex flex-col h-full bg-background">
      {/* File header */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-card shrink-0 text-[11px]">
        <span className="text-muted-foreground font-mono truncate">
          {file.path.replace(`/${fileName}`, "")}/<span className="text-foreground font-semibold">{fileName}</span>
        </span>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <button
            onClick={() => setDiffStyle(s => s === "unified" ? "split" : "unified")}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title={diffStyle === "unified" ? "Switch to split view" : "Switch to unified view"}
          >
            {diffStyle === "unified" ? <IconLayoutColumns size={13} /> : <IconLayoutRows size={13} />}
          </button>
          <button
            onClick={() => setViewed(!viewed)}
            className={cn("flex items-center gap-1.5 transition-colors", viewed ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <IconEye size={13} />
            <span>Viewed</span>
          </button>
          <button
            onClick={() => rawDiff && navigator.clipboard.writeText(rawDiff)}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title="Copy diff"
          >
            <IconCopy size={13} />
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div>
        {fileDiff && (
          <FileDiff
            fileDiff={fileDiff}
            options={{
              theme: "vesper",
              diffStyle,
              lineDiffType: "word",
              diffIndicators: "bars",
              disableFileHeader: true,
              hunkSeparators: "line-info",
              expandedHunks,
              onHunkExpand,
            }}
          />
        )}
        </div>
      </div>
    </div>
  )
}
