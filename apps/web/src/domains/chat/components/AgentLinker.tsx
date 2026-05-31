import { useState } from "react"
import { cn, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import {
  IconCheck,
  IconFolderSymlink,
  IconPlus,
} from "@tabler/icons-react"
import type { AgentSummary } from "@huxflux/shared"

interface AgentLinkerProps {
  allAgents: AgentSummary[]
  currentAgentId: string
  linkedAgents: AgentSummary[]
  onToggle: (a: AgentSummary) => void
}

export function AgentLinker({ allAgents, currentAgentId, linkedAgents, onToggle }: AgentLinkerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = allAgents
    .filter((a) => a.id !== currentAgentId)
    .filter((a) => !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.branch.toLowerCase().includes(search.toLowerCase()))

  function handleOpenChange(o: boolean) {
    setOpen(o)
    if (o) setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-3 w-full px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-md transition-colors">
          <IconFolderSymlink size={15} className="text-muted-foreground shrink-0" />
          <span>Link workspaces</span>
          {linkedAgents.length > 0 && (
            <span className="ml-auto text-[11px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{linkedAgents.length}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-64 p-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workspaces…"
          autoFocus
          className="w-full bg-transparent border-b border-border px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/40"
        />
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/50 px-3 py-2">No workspaces found</p>
          ) : (
            filtered.map((a) => {
              const linked = linkedAgents.some((x) => x.id === a.id)
              return (
                <button
                  key={a.id}
                  onClick={() => onToggle(a)}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-1.5 text-[12px] rounded-md transition-colors text-left",
                    linked ? "bg-blue-500/10 text-blue-300" : "text-foreground hover:bg-accent"
                  )}
                >
                  <IconFolderSymlink size={12} className={cn("shrink-0", linked ? "text-blue-400" : "text-muted-foreground/50")} />
                  <span className="truncate flex-1">{a.title}</span>
                  {linked && <IconCheck size={12} className="text-blue-400 shrink-0" />}
                </button>
              )
            })
          )}
        </div>
        <div className="border-t border-border p-1">
          <button
            onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("huxflux:new-agent")) }}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <IconPlus size={12} className="shrink-0" />
            <span>New workspace</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
