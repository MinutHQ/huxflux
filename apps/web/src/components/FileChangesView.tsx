import { useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Agent, FileChange } from "@/data/mock"
import {
  IconFileText,
  IconChevronDown,
  IconCheck,
  IconSearch,
} from "@tabler/icons-react"

// ── Changes list ──────────────────────────────────────────────────────────────

type FilterMode = "all" | "uncommitted"

function ChangesView({
  files,
  selectedFile,
  onFileSelect,
}: {
  files: FileChange[]
  selectedFile: string | null
  onFileSelect: (file: FileChange | null) => void
}) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all")
  const [filterOpen, setFilterOpen] = useState(false)

  return (
    <>
      {files.length > 0 && (
        <div className="relative shrink-0">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="w-full flex items-center justify-between px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors border-b border-border"
          >
            <span>{filterMode === "all" ? "All changes" : `Uncommitted changes · ${files.length} files`}</span>
            <IconChevronDown size={13} className={cn("transition-transform", filterOpen && "rotate-180")} />
          </button>

          {filterOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
              <div className="absolute top-full left-0 right-0 z-20 bg-card border border-border rounded-lg shadow-lg overflow-hidden mx-2 mt-1">
                {(["all", "uncommitted"] as FilterMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setFilterMode(mode); setFilterOpen(false) }}
                    className="w-full flex items-start justify-between px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-foreground">
                        {mode === "all" ? "All changes" : "Uncommitted changes"}
                      </div>
                      {mode === "uncommitted" && (
                        <div className="text-[12px] text-muted-foreground mt-0.5">{files.length} files changed</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {mode === "uncommitted" && (
                        <span className="text-[11px] text-muted-foreground/50 font-mono">⌥U</span>
                      )}
                      {filterMode === mode && <IconCheck size={14} className="text-foreground shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <IconFileText size={22} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/40">No file changes</p>
            </div>
          ) : (
            <div className="py-1">
              {files.map((file) => {
                const name = file.path.split("/").pop() ?? file.path
                const dir = file.path.split("/").slice(0, -1).join("/")
                const isSelected = selectedFile === file.path
                const isAddOnly = file.deletions === 0
                const isDelOnly = file.additions === 0

                return (
                  <button
                    key={file.path}
                    onClick={() => onFileSelect(isSelected ? null : file)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                      isSelected ? "bg-accent" : "hover:bg-accent/40"
                    )}
                  >
                    <div className="flex-1 min-w-0 flex items-baseline gap-1 truncate">
                      {dir && (
                        <span className="text-[12px] text-muted-foreground/60 truncate shrink-1 min-w-0">
                          {dir.length > 28 ? dir.slice(0, 28) + "…" : dir}/
                        </span>
                      )}
                      <span className="text-[12px] font-semibold text-foreground truncate shrink-0">{name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground/50 font-medium">U</span>
                      <span className="font-mono text-[11px]">
                        <span className="text-emerald-400">+{file.additions}</span>
                        {" "}
                        <span className="text-red-400">-{file.deletions}</span>
                      </span>
                      <span className={cn(
                        "w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] font-bold shrink-0",
                        isAddOnly
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : isDelOnly
                          ? "border-red-400/40 text-red-400 bg-red-400/10"
                          : "border-amber-400/40 text-amber-400 bg-amber-400/10"
                      )}>
                        {isAddOnly ? "+" : isDelOnly ? "−" : "M"}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface FileChangesViewProps {
  agent: Agent
  selectedFile: string | null
  onFileSelect: (file: FileChange | null) => void
}

export function FileChangesView({ agent, selectedFile, onFileSelect }: FileChangesViewProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-[12px] font-medium text-foreground">Changes</span>
        {agent.fileChanges.length > 0 && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-secondary text-muted-foreground">
            {agent.fileChanges.length}
          </span>
        )}
        <button className="ml-auto p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
          <IconSearch size={14} />
        </button>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <ChangesView
          files={agent.fileChanges}
          selectedFile={selectedFile}
          onFileSelect={onFileSelect}
        />
      </div>
    </div>
  )
}
