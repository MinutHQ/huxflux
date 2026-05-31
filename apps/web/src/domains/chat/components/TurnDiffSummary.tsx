import { useMemo, useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconChevronRight,
  IconFileCode,
  IconLayoutColumns,
  IconLayoutRows,
} from "@tabler/icons-react"
import type { ToolCall } from "@huxflux/shared"
import type { TurnFileEdit } from "../chat.types"
import { extractFileEdits } from "../extract/fileEdits"
import { useDiffTheme } from "../hooks/useDiffTheme"
import { TurnFileDiff } from "./TurnFileDiff"

function countEditLines(edits: TurnFileEdit["edits"]): { additions: number; deletions: number } {
  const additions = edits.reduce((sum, e) => sum + (e.newStr ? e.newStr.split("\n").length : 0), 0)
  const deletions = edits.reduce((sum, e) => sum + (e.oldStr ? e.oldStr.split("\n").length : 0), 0)
  return { additions, deletions }
}

interface TurnDiffFileRowProps {
  diff: TurnFileEdit
  isExpanded: boolean
  diffTheme: "vesper" | "github-light"
  diffStyle: "unified" | "split"
  onToggle: () => void
}

function TurnDiffFileRow({ diff, isExpanded, diffTheme, diffStyle, onToggle }: TurnDiffFileRowProps) {
  // Show relative path from workspace root (strip everything up to and including common roots like src/, apps/, packages/, lib/)
  const relativePath = diff.path.replace(/^.*?\/(src|apps|packages|lib)\//, "$1/")
  const { additions, deletions } = countEditLines(diff.edits)
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/20 transition-colors min-w-0"
      >
        <IconChevronRight size={10} className={cn("transition-transform shrink-0 text-muted-foreground/40", isExpanded && "rotate-90")} />
        {diff.isNew && <span className="text-[9px] font-medium text-green-500 bg-green-500/10 px-1 rounded shrink-0">NEW</span>}
        <span className="font-mono text-foreground/70 truncate">{relativePath}</span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {additions > 0 && <span className="text-green-400/70">+{additions}</span>}
          {deletions > 0 && <span className="text-red-400/70">-{deletions}</span>}
        </span>
      </button>
      {isExpanded && (
        <TurnFileDiff filePath={diff.path} edits={diff.edits} isNew={diff.isNew} diffTheme={diffTheme} diffStyle={diffStyle} />
      )}
    </div>
  )
}

export function TurnDiffSummary({ calls }: { calls: ToolCall[] }) {
  const fileEdits = useMemo(() => extractFileEdits(calls), [calls])
  const [open, setOpen] = useState(false)
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified")
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const diffTheme = useDiffTheme()

  if (fileEdits.length === 0) return null

  const totalEdits = fileEdits.reduce((sum, d) => sum + d.edits.length, 0)
  const label = fileEdits.length === 1 ? `1 file changed` : `${fileEdits.length} files changed`

  function toggleFile(path: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="mt-2 mb-1 border border-border/50 rounded-lg overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 flex-1 text-left px-3 py-2 text-[12px] hover:bg-muted/30 transition-colors"
        >
          <IconChevronRight size={12} className={cn("transition-transform shrink-0 text-muted-foreground/60", open && "rotate-90")} />
          <IconFileCode size={13} className="text-muted-foreground/60 shrink-0" />
          <span className="font-medium text-foreground/70">{label}</span>
          <span className="text-muted-foreground/40 ml-1">{totalEdits} edit{totalEdits !== 1 ? "s" : ""}</span>
        </button>
        {open && (
          <button
            onClick={() => setDiffStyle(s => s === "unified" ? "split" : "unified")}
            className="px-2 py-1 mr-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title={diffStyle === "unified" ? "Switch to split view" : "Switch to unified view"}
          >
            {diffStyle === "unified" ? <IconLayoutColumns size={13} /> : <IconLayoutRows size={13} />}
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-border/30">
          {fileEdits.map((diff) => (
            <TurnDiffFileRow
              key={diff.path}
              diff={diff}
              isExpanded={expandedFiles.has(diff.path)}
              diffTheme={diffTheme}
              diffStyle={diffStyle}
              onToggle={() => toggleFile(diff.path)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
