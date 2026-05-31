import { useState } from "react"
import { IconTrash } from "@tabler/icons-react"
import { statusConfig, type AgentSummary, type AgentStatus } from "@huxflux/shared"
import { StatusIcon } from "./StatusIcon"
import { AgentRow } from "./AgentRow"

interface StatusGroupProps {
  status: AgentStatus
  agents: AgentSummary[]
  selectedId: string
  onSelect: (id: string) => void
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
  onDelete: (agent: AgentSummary) => void
  onArchiveAll?: () => void
  agentPorts?: Record<string, number | null>
  repoNames: Record<string, string>
  repoIcons?: Record<string, string | undefined>
  repoTypes?: Record<string, string | undefined>
  threadChildrenByParent?: Map<string, AgentSummary[]>
}

/**
 * Header row + collapsible body for a single status (Done, In review, etc.).
 * Collapsed state is persisted in localStorage per status; "done" defaults to
 * collapsed so finished agents don't clutter the list.
 *
 * Thread children (agents with `threadParentId`) are nested under their parent
 * row with a left border, keeping branching conversations grouped visually.
 */
export function StatusGroup({
  status,
  agents,
  selectedId,
  onSelect,
  onHover,
  onLeave,
  onDelete,
  onArchiveAll,
  threadChildrenByParent,
  agentPorts,
  repoNames,
  repoIcons,
  repoTypes,
}: StatusGroupProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(`huxflux:sidebar-group:${status}`)
      if (stored !== null) return stored === "true"
    } catch { /* ignore */ }
    return status === "done"
  })
  const config = statusConfig[status]

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(`huxflux:sidebar-group:${status}`, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="mb-2.5">
      <button
        onClick={toggleCollapsed}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-sidebar-accent/40 rounded-md transition-colors"
      >
        <StatusIcon status={status} size={14} />
        <span className="text-[13px] font-semibold text-sidebar-foreground flex-1 text-left">
          {config.label}
        </span>
        {agents.length > 0 && (
          <span className="text-[12px] text-muted-foreground/50 tabular-nums">{agents.length}</span>
        )}
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-0.5 px-1 min-w-0 overflow-hidden">
          {agents.map((agent) => (
            <div key={agent.id}>
              <AgentRow
                agent={agent}
                isSelected={selectedId === agent.id}
                isStreaming={!!agent.streaming}
                onClick={() => onSelect(agent.id)}
                onHover={onHover}
                onLeave={onLeave}
                onDelete={onDelete}
                port={agentPorts?.[agent.id]}
                repoName={agent.repoId ? repoNames[agent.repoId] : undefined}
                repoIcon={agent.repoId ? repoIcons?.[agent.repoId] : undefined}
                repoType={agent.repoId ? repoTypes?.[agent.repoId] : undefined}
              />
              {/* Thread children nested under parent */}
              {threadChildrenByParent?.get(agent.id)?.map((child) => (
                <div key={child.id} className="ml-4 border-l border-border/30 pl-1">
                  <AgentRow
                    agent={child}
                    isSelected={selectedId === child.id}
                    isStreaming={!!child.streaming}
                    onClick={() => onSelect(child.id)}
                    onHover={onHover}
                    onLeave={onLeave}
                    onDelete={onDelete}
                    port={agentPorts?.[child.id]}
                    repoName={child.repoId ? repoNames[child.repoId] : undefined}
                    repoIcon={child.repoId ? repoIcons?.[child.repoId] : undefined}
                    repoType={child.repoId ? repoTypes?.[child.repoId] : undefined}
                  />
                </div>
              ))}
            </div>
          ))}
          {onArchiveAll && agents.length > 0 && (
            <button
              onClick={onArchiveAll}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-sidebar-accent/40 transition-colors text-[12px]"
            >
              <IconTrash size={12} />
              Archive all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
