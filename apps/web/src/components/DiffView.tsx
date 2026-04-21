import { useEffect, useRef, useState, useMemo, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import type { FileChange } from "@/data/mock"
import { api } from "@huxflux/shared"
import { getTheme } from "@/lib/theme"
import { IconCopy, IconEye, IconLayoutColumns, IconLayoutRows } from "@tabler/icons-react"
import { FileDiff } from "@pierre/diffs/react"
import { processFile } from "@pierre/diffs"
import type { ExpansionDirections, HunkExpansionRegion } from "@pierre/diffs/react"

export function getDiffTheme(): "vesper" | "github-light" {
  const theme = getTheme()
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  return isDark ? "vesper" : "github-light"
}

function useDiffTheme() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("huxflux:theme-change", cb); return () => window.removeEventListener("huxflux:theme-change", cb) },
    getDiffTheme,
    () => "vesper" as const
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiffView({ agentId, file, hideHeader }: { agentId: string; file: FileChange; hideHeader?: boolean }) {
  const [viewed, setViewed] = useState(false)
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified")
  const diffTheme = useDiffTheme()
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

  // Long staleTime prevents refetching while reviewing — manual refresh available
  const { data: rawDiff } = useQuery({
    queryKey: ["diff", agentId, file.path],
    queryFn: () => api.getDiff(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const { data: newContent } = useQuery({
    queryKey: ["file-content", agentId, file.path],
    queryFn: () => api.getFileContent(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !!rawDiff,
  })

  const { data: oldContent } = useQuery({
    queryKey: ["file-base-content", agentId, file.path],
    queryFn: () => api.getBaseFileContent(agentId, file.path),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !!rawDiff,
  })

  // Memoize to prevent re-processing on every render
  const fileDiff = useMemo(() => {
    if (rawDiff && oldContent !== undefined && newContent !== undefined) {
      return processFile(rawDiff, {
        oldFile: { name: fileName, contents: oldContent },
        newFile: { name: fileName, contents: newContent },
      })
    }
    return rawDiff ? processFile(rawDiff) : null
  }, [rawDiff, oldContent, newContent, fileName])

  // Preserve scroll position when fileDiff updates (data refetch)
  const prevScrollRef = useRef(0)
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !fileDiff) return
    // Restore scroll after React re-renders the diff
    requestAnimationFrame(() => {
      if (prevScrollRef.current > 0) {
        container.scrollTop = prevScrollRef.current
      }
    })
  }, [fileDiff])

  // Track scroll position continuously
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const onScroll = () => { prevScrollRef.current = container.scrollTop }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [])

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
      {!hideHeader && <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-card shrink-0 text-[11px]">
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
      </div>}

      {/* Diff content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div>
        {fileDiff && (
          <FileDiff
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
            } as any}
          />
        )}
        </div>
      </div>
    </div>
  )
}
