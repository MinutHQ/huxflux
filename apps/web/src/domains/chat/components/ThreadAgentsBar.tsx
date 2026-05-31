import { useMemo } from "react"
import { cn } from "@huxflux/ui"
import { useNavigate } from "@tanstack/react-router"
import {
  IconArrowUpRight,
  IconCheck,
  IconGitBranch,
  IconLoader2,
} from "@tabler/icons-react"
import { useAgents } from "@huxflux/shared"

export function ThreadAgentsBar({ agentId }: { agentId: string }) {
  const navigate = useNavigate()
  const { data: allAgents = [] } = useAgents()
  const threadChildren = useMemo(
    () => allAgents.filter((a) => a.threadParentId === agentId),
    [allAgents, agentId]
  )

  // Also check if this agent IS a thread child and show the parent
  const parentAgent = useMemo(
    () => {
      const self = allAgents.find((a) => a.id === agentId)
      if (!self?.threadParentId) return null
      return allAgents.find((a) => a.id === self.threadParentId) ?? null
    },
    [allAgents, agentId]
  )

  if (threadChildren.length === 0 && !parentAgent) return null

  return (
    <div className="mx-2 mb-2 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
        <IconGitBranch size={12} className="text-muted-foreground/50 shrink-0" />
        <span className="text-[11px] font-semibold text-muted-foreground/70 shrink-0">Threads</span>
        <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />
        {parentAgent && (
          <button
            onClick={() => navigate({ to: "/agent/$agentId", params: { agentId: parentAgent.id } })}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 whitespace-nowrap shrink-0"
          >
            <IconArrowUpRight size={11} className="text-muted-foreground/50 shrink-0" />
            <span className="max-w-[140px] truncate">↑ {parentAgent.title}</span>
          </button>
        )}
        {threadChildren.map((child) => (
          <button
            key={child.id}
            onClick={() => navigate({ to: "/agent/$agentId", params: { agentId: child.id } })}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 whitespace-nowrap shrink-0"
          >
            {child.streaming ? (
              <IconLoader2 size={11} className="animate-spin text-amber-400 shrink-0" />
            ) : child.status === "done" ? (
              <IconCheck size={11} className="text-emerald-400 shrink-0" />
            ) : (
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                child.status === "in-progress" ? "bg-amber-400" :
                child.status === "in-review" ? "bg-blue-400" : "bg-muted-foreground/40"
              )} />
            )}
            <span className="max-w-[140px] truncate">{child.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
