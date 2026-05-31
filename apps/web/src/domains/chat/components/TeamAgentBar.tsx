import { useEffect, useRef, useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconUsers,
  IconX,
} from "@tabler/icons-react"
import type { TeamAgent } from "../chat.types"
import { TeamAgentOutput } from "./TeamAgentOutput"

interface TeamAgentBarProps {
  agents: TeamAgent[]
  isStreaming?: boolean
  agentId: string
}

interface TeamTabsProps {
  agents: TeamAgent[]
  selectedId: string
  runningCount: number
  doneCount: number
  collapsed: boolean
  isStreaming: boolean | undefined
  onToggleCollapsed: () => void
  onSelect: (id: string) => void
  onDismiss: () => void
}

function TeamTabs({ agents, selectedId, runningCount, doneCount, collapsed, isStreaming, onToggleCollapsed, onSelect, onDismiss }: TeamTabsProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto">
      <button
        onClick={onToggleCollapsed}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
      >
        <IconUsers size={12} className="text-muted-foreground/50" />
        <span>Team</span>
        <span className="text-muted-foreground/40 font-mono ml-0.5">
          {runningCount > 0 && `${runningCount} running`}
          {runningCount > 0 && doneCount > 0 && ", "}
          {doneCount > 0 && `${doneCount} done`}
        </span>
        <IconChevronDown size={11} className={cn("transition-transform ml-0.5", collapsed && "-rotate-90")} />
      </button>
      <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />
      {agents.map((agent) => {
        const isActive = agent.id === selectedId
        return (
          <button
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {agent.status === "running" && isStreaming ? (
              <IconLoader2 size={11} className="animate-spin text-amber-400 shrink-0" />
            ) : (
              <IconCheck size={11} className="text-emerald-400 shrink-0" />
            )}
            <span className="max-w-[140px] truncate">{agent.description}</span>
          </button>
        )
      })}
      <button
        onClick={onDismiss}
        className="ml-auto p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
      >
        <IconX size={11} />
      </button>
    </div>
  )
}

export function TeamAgentBar({ agents, isStreaming, agentId }: TeamAgentBarProps) {
  const storageKey = `huxflux-team-dismissed-${agentId}`
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedUserToggled, setCollapsedUserToggled] = useState(false)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "1")

  // Auto-collapse the panel when no agents are running anymore — unless user toggled
  const anyRunning = agents.some((a) => a.status === "running")
  useEffect(() => {
    if (collapsedUserToggled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: auto-collapse when no agents are running, user-toggle wins
    setCollapsed(!anyRunning)
  }, [anyRunning, collapsedUserToggled])

  // Re-show when new agent IDs appear (handles dismiss → new team)
  useEffect(() => {
    const newIds = agents.filter((a) => !knownIdsRef.current.has(a.id))
    if (newIds.length > 0) {
      for (const a of newIds) knownIdsRef.current.add(a.id)
      localStorage.removeItem(storageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: undismiss when a brand-new team appears
      setDismissed(false)
      if (!selectedId || !agents.some((a) => a.id === selectedId)) {
        setSelectedId(newIds[0].id)
      }
    }
  }, [agents]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    localStorage.setItem(storageKey, "1")
    setDismissed(true)
  }

  if (dismissed || agents.length < 2) return null

  const selected = agents.find((a) => a.id === selectedId) ?? agents[0]
  const runningCount = agents.filter((a) => a.status === "running").length
  const doneCount = agents.filter((a) => a.status === "done").length

  return (
    <div className="mx-2 mb-2 rounded-xl border border-border bg-card overflow-hidden">
      <TeamTabs
        agents={agents}
        selectedId={selected.id}
        runningCount={runningCount}
        doneCount={doneCount}
        collapsed={collapsed}
        isStreaming={isStreaming}
        onToggleCollapsed={() => { setCollapsed(!collapsed); setCollapsedUserToggled(true) }}
        onSelect={(id) => { setSelectedId(id); setCollapsed(false); setCollapsedUserToggled(true) }}
        onDismiss={handleDismiss}
      />
      {!collapsed && selected && (
        <div className="border-t border-border/60 px-3">
          <TeamAgentOutput selected={selected} />
        </div>
      )}
    </div>
  )
}
