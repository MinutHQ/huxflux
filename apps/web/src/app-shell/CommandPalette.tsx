import { useState, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { cn } from "@huxflux/ui"
import { IconSearch, IconGitBranch } from "@tabler/icons-react"
import type { AgentSummary } from "@huxflux/shared"

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  agents: AgentSummary[]
  onSelectAgent: (id: string) => void
}

export function CommandPalette({ open, onClose, agents, onSelectAgent }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return agents
    const q = query.toLowerCase().trim()

    // Match GitHub PR URL: extract PR number
    const prUrlMatch = q.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)
    if (prUrlMatch) {
      const prNum = parseInt(prUrlMatch[1])
      return agents.filter((a) => a.prNumber === prNum)
    }

    // Match PR number shorthand: #123
    const prNumMatch = q.match(/^#(\d+)$/)
    if (prNumMatch) {
      const prNum = parseInt(prNumMatch[1])
      return agents.filter((a) => a.prNumber === prNum)
    }

    return agents.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.branch.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q) ||
        (a.prNumber && `#${a.prNumber}`.includes(q))
    )
  }, [agents, query])

  // Reset query + index whenever the palette transitions to open. Detected
  // by comparing `open` against the previous render, so we don't need an
  // effect to set state.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setQuery("")
      setSelectedIndex(0)
    }
  }

  // Clamp the selected index against the current filter result. Derived
  // during render so a shrinking list can't leave the highlight stranded.
  const safeIndex = Math.min(selectedIndex, Math.max(filtered.length - 1, 0))

  // Focus the input shortly after the palette opens.
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [open])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[safeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [safeIndex])

  // Close on escape, navigate with arrows, select with enter
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose() }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
      if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault()
        onSelectAgent(filtered[safeIndex].id)
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, filtered, safeIndex, onSelectAgent, onClose])

  if (!open) return null

  const statusColor: Record<string, string> = {
    "in-progress": "bg-amber-400",
    "draft-pr": "bg-violet-400",
    "in-review": "bg-blue-400",
    "backlog": "bg-muted-foreground/30",
    "done": "bg-emerald-400",
    "cancelled": "bg-red-400",
  }

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <IconSearch size={15} className="text-muted-foreground/40 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents by name, branch, or PR link…"
              className="flex-1 bg-transparent py-3.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
            <kbd className="text-[10px] text-muted-foreground/30 border border-border rounded px-1.5 py-0.5 font-mono">ESC</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground/40">
                No agents found
              </div>
            )}
            {filtered.map((agent, i) => (
              <button
                key={agent.id}
                onClick={() => { onSelectAgent(agent.id); onClose() }}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  i === safeIndex ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusColor[agent.status] ?? "bg-muted-foreground/30")} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-foreground truncate">{agent.title}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                    <IconGitBranch size={10} className="shrink-0" />
                    <span className="truncate font-mono">{agent.branch}</span>
                  </div>
                </div>
                {agent.prStatus && (
                  <span className="text-[10px] text-muted-foreground/40 font-mono shrink-0">
                    #{agent.prStatus.number}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted-foreground/30">
            <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1 py-0.5 font-mono">↵</kbd> select</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
