import { useState } from "react"
import { IconPin } from "@tabler/icons-react"
import type { AgentSummary } from "@huxflux/shared"
import { AgentRow } from "./AgentRow"

interface PinnedGroupProps {
  agents: AgentSummary[]
  selectedId: string
  onSelect: (id: string) => void
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
  onDelete: (agent: AgentSummary) => void
  agentPorts?: Record<string, number | null>
  repoNames: Record<string, string>
  repoIcons?: Record<string, string | undefined>
  repoTypes?: Record<string, string | undefined>
  threadChildrenByParent?: Map<string, AgentSummary[]>
}

/**
 * "Pinned" sidebar section. Lists every agent the user has pinned, regardless
 * of status, with the same row + nested-thread shape as the status groups.
 * Collapsed state is persisted in localStorage so the section stays out of the
 * way once the user has set it that way.
 */
export function PinnedGroup({
  agents,
  selectedId,
  onSelect,
  onHover,
  onLeave,
  onDelete,
  threadChildrenByParent,
  agentPorts,
  repoNames,
  repoIcons,
  repoTypes,
}: PinnedGroupProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem("huxflux:sidebar-group:pinned")
      if (stored !== null) return stored === "true"
    } catch { /* ignore */ }
    return false
  })

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem("huxflux:sidebar-group:pinned", String(next)) } catch { /* ignore */ }
      return next
    })
  }

  if (agents.length === 0) return null

  return (
    <div className="mb-2.5">
      <button
        onClick={toggleCollapsed}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-sidebar-accent/40 rounded-md transition-colors"
      >
        <IconPin size={14} className="text-muted-foreground shrink-0" />
        <span className="text-[13px] font-semibold text-sidebar-foreground flex-1 text-left">Pinned</span>
        <span className="text-[12px] text-muted-foreground/50 tabular-nums">{agents.length}</span>
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
        </div>
      )}
    </div>
  )
}
