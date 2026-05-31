import { useState } from "react"
import type { AgentSummary } from "@huxflux/shared"
import { AgentRow } from "./AgentRow"

interface RepoGroupProps {
  repoName: string
  repoType?: string
  agents: AgentSummary[]
  selectedId: string
  onSelect: (id: string) => void
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
  onDelete: (agent: AgentSummary) => void
  agentPorts?: Record<string, number | null>
}

/**
 * Used when the user picks "Group by repo" in the filter popover. Renders a
 * compact repo header + a flat list of that repo's agents (no status grouping).
 */
export function RepoGroup({
  repoName,
  repoType,
  agents,
  selectedId,
  onSelect,
  onHover,
  onLeave,
  onDelete,
  agentPorts,
}: RepoGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const initials = repoName[0].toUpperCase()

  if (agents.length === 0) return null

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-sidebar-accent/40 rounded-md transition-colors"
      >
        <span className="w-4 h-4 rounded-sm bg-muted border border-border text-[9px] font-bold flex items-center justify-center shrink-0 text-muted-foreground">
          {initials}
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground truncate">
          {repoName}
        </span>
        {agents.length > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground/40 font-mono">{agents.length}</span>
        )}
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-0.5 px-1 min-w-0 overflow-hidden">
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              isSelected={selectedId === agent.id}
              isStreaming={!!agent.streaming}
              onClick={() => onSelect(agent.id)}
              onHover={onHover}
              onLeave={onLeave}
              onDelete={onDelete}
              port={agentPorts?.[agent.id]}
              repoName={repoName}
              repoType={repoType}
            />
          ))}
        </div>
      )}
    </div>
  )
}
