import { useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { statusOrder, statusConfig, type AgentSummary, type AgentStatus } from "@/data/mock"
import { api } from "@/lib/api"
import { useRepos } from "@/hooks/useRepos"
import { useQueryClient } from "@tanstack/react-query"
import { ServerSwitcher } from "@/components/ServerSwitcher"
import {
  IconChevronRight,
  IconPlus,
  IconFilter,
  IconSettings,
  IconGitBranch,
  IconFolderPlus,
  IconArrowUpRight,
  IconX,
  IconSparkles,
} from "@tabler/icons-react"

// ── Status dot ────────────────────────────────────────────────────────────────

const statusDot: Record<AgentStatus, string> = {
  "in-progress": "bg-amber-400",
  "in-review":   "bg-emerald-400",
  "done":        "bg-emerald-400",
  "backlog":     "bg-muted-foreground/40",
  "cancelled":   "bg-red-400",
}

// ── Hover popover ─────────────────────────────────────────────────────────────

function AgentPopover({ agent, y }: { agent: AgentSummary; y: number }) {
  const statusLabel =
    agent.status === "in-review" ? "In review"
    : agent.status === "in-progress" ? "In progress"
    : agent.status === "done" ? "Done"
    : agent.status === "backlog" ? "Backlog"
    : "Cancelled"

  return createPortal(
    <div
      className="fixed z-50 w-72 bg-card border border-border rounded-xl shadow-xl p-3 pointer-events-none"
      style={{ left: 264, top: Math.max(8, y - 8) }}
    >
      <div className="flex items-start gap-2 mb-2">
        <IconGitBranch size={13} className="text-muted-foreground/50 mt-0.5 shrink-0" />
        <span className="text-[13px] font-medium text-foreground leading-snug line-clamp-2">
          {agent.title}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-2">
        <span className={cn("w-2 h-2 rounded-full shrink-0", statusDot[agent.status])} />
        <span>{statusLabel}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="font-mono">{agent.location}</span>
        {agent.daysAgo && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{agent.daysAgo}</span>
          </>
        )}
      </div>

      {agent.description && (
        <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
          {agent.description}
        </p>
      )}

      {agent.diffSummary && (
        <div className="flex items-center gap-2 text-[12px] font-mono mb-3">
          <span className="text-emerald-400">+{agent.diffSummary.additions}</span>
          <span className="text-red-400">-{agent.diffSummary.deletions}</span>
          {agent.diffSummary.commits !== undefined && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/60">♟{agent.diffSummary.commits}</span>
            </>
          )}
          {agent.pr && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/60 flex items-center gap-0.5">
                {agent.pr}
                <IconArrowUpRight size={11} />
              </span>
            </>
          )}
        </div>
      )}

      {agent.status === "in-review" && (
        <button className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[12px] font-medium pointer-events-auto">
          Ready for review
        </button>
      )}
      {agent.status === "in-progress" && (
        <button className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[12px] font-medium pointer-events-auto">
          In progress
        </button>
      )}
    </div>,
    document.body
  )
}

// ── New agent dialog ──────────────────────────────────────────────────────────

const BEE_ADJECTIVES = [
  "golden", "amber", "clover", "lavender", "sage", "thyme", "meadow",
  "misty", "swift", "bright", "busy", "wild", "pollen", "honey", "wax",
  "violet", "royal", "fuzzy", "striped", "sunlit",
]
const BEE_NOUNS = [
  "scout", "forager", "guard", "worker", "drone", "nurse", "harvester",
  "wanderer", "pilgrim", "ranger", "keeper", "seeker", "drifter", "carrier",
]

function randomBeeName(): string {
  const adj = BEE_ADJECTIVES[Math.floor(Math.random() * BEE_ADJECTIVES.length)]
  const noun = BEE_NOUNS[Math.floor(Math.random() * BEE_NOUNS.length)]
  return `${adj}-${noun}`
}

function NewAgentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [creating, setCreating] = useState<string | null>(null) // repoId currently being created
  const { data: repos = [] } = useRepos()
  const queryClient = useQueryClient()

  async function handleSelectRepo(repoId: string) {
    if (creating) return
    setCreating(repoId)
    try {
      const name = randomBeeName()
      const branch = `agent/${name}`
      const agent = await api.createAgent({
        title: name,
        branch,
        model: "claude-sonnet-4-6",
        repoId,
      })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      onCreated(agent.id)
    } finally {
      setCreating(null)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
        if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
          const idx = parseInt(e.key) - 1
          if (idx < repos.length) handleSelectRepo(repos[idx].id)
        }
      }}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[12px] font-medium text-muted-foreground">New agent in…</span>
          <button onClick={onClose} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <IconX size={14} />
          </button>
        </div>

        {repos.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-muted-foreground/50">
            No repositories yet.<br />Add one in Settings first.
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {repos.map((r, i) => {
              const isCreating = creating === r.id
              const shortcut = i < 9 ? i + 1 : null
              return (
                <button
                  key={r.id}
                  autoFocus={i === 0}
                  onClick={() => handleSelectRepo(r.id)}
                  disabled={!!creating}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors",
                    isCreating
                      ? "bg-accent text-foreground"
                      : "hover:bg-accent/60 text-foreground"
                  )}
                >
                  <span className="w-6 h-6 rounded-md bg-muted border border-border text-[11px] font-bold flex items-center justify-center shrink-0 text-muted-foreground">
                    {r.name[0].toUpperCase()}
                  </span>
                  <span className="text-sm font-medium flex-1 truncate">
                    {isCreating ? "Creating…" : r.name}
                  </span>
                  {shortcut && !creating && (
                    <span className="text-[11px] text-muted-foreground/40 font-mono tabular-nums shrink-0">
                      {shortcut}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Agent row ─────────────────────────────────────────────────────────────────

const modelColors: Record<string, string> = {
  "Opus 4.6":   "bg-primary text-primary-foreground",
  "Sonnet 4.6": "bg-secondary text-secondary-foreground",
  "Haiku 4.5":  "bg-muted text-muted-foreground",
  "claude-opus-4-6":            "bg-primary text-primary-foreground",
  "claude-sonnet-4-6":          "bg-secondary text-secondary-foreground",
  "claude-haiku-4-5-20251001":  "bg-muted text-muted-foreground",
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-[3px] shrink-0">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] h-[3px] rounded-full bg-amber-400"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  )
}

function AgentRow({
  agent,
  isSelected,
  isStreaming,
  onClick,
  index,
  onHover,
  onLeave,
}: {
  agent: AgentSummary
  isSelected: boolean
  isStreaming: boolean
  onClick: () => void
  index: number
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const modelColor = modelColors[agent.model] ?? "bg-muted text-muted-foreground"
  const initials = (agent.location ?? agent.title)[0].toUpperCase()
  const isCancelled = agent.status === "cancelled"
  const shortcutNum = index < 9 ? index + 1 : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  function handleMouseEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      onHover(agent, rect.top)
    }
  }

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setDraft(agent.title)
    setEditing(true)
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  async function commitEdit() {
    const title = draft.trim()
    setEditing(false)
    if (!title || title === agent.title) return
    await api.updateAgent(agent.id, { title })
    queryClient.setQueryData<AgentSummary[]>(["agents"], (old) =>
      old ? old.map((a) => a.id === agent.id ? { ...a, title } : a) : old
    )
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      className={cn(
        "w-full min-w-0 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-all",
        isSelected
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground",
        isCancelled && "opacity-50"
      )}
    >
      <div className={cn("w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0", modelColor)}>
        {initials}
      </div>
      {isStreaming ? (
        <StreamingDots />
      ) : (
        <IconGitBranch size={11} className="text-muted-foreground/40 shrink-0" />
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit() }
            if (e.key === "Escape") cancelEdit()
          }}
          onBlur={commitEdit}
          className="text-xs flex-1 min-w-0 bg-background border border-ring rounded px-1.5 py-0.5 leading-tight outline-none"
        />
      ) : (
        <span
          onDoubleClick={startEdit}
          className={cn(
            "text-xs flex-1 min-w-0 truncate leading-tight",
            isSelected && "font-semibold",
            isCancelled && "line-through"
          )}
        >
          {agent.title}
        </span>
      )}
      {shortcutNum !== null && !isStreaming && !editing && (
        <span className="text-[10px] text-muted-foreground/40 font-mono shrink-0 tabular-nums">
          {shortcutNum}
        </span>
      )}
    </button>
  )
}

// ── Status group ──────────────────────────────────────────────────────────────

function StatusGroup({
  status,
  agents,
  selectedId,
  streamingAgentId,
  onSelect,
  startIndex,
  onHover,
  onLeave,
}: {
  status: AgentStatus
  agents: AgentSummary[]
  selectedId: string
  streamingAgentId: string | null
  onSelect: (id: string) => void
  startIndex: number
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
}) {
  const [collapsed, setCollapsed] = useState(status === "done" || status === "cancelled")
  const config = statusConfig[status]

  if (agents.length === 0) return null

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-sidebar-accent/40 rounded-md transition-colors"
      >
        <IconChevronRight
          size={12}
          className={cn("text-muted-foreground/40 transition-transform duration-150", !collapsed && "rotate-90")}
        />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", config.color)}>
          {config.label}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground/40 font-mono">{agents.length}</span>
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-0.5 px-1">
          {agents.map((agent, i) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              isSelected={selectedId === agent.id}
              isStreaming={streamingAgentId === agent.id}
              onClick={() => onSelect(agent.id)}
              index={startIndex + i}
              onHover={onHover}
              onLeave={onLeave}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

interface SidebarProps {
  agents: AgentSummary[]
  selectedId: string
  streamingAgentId: string | null
  onSelect: (id: string) => void
  onOpenSettings: () => void
  onAgentCreated: (id: string) => void
}

export function Sidebar({ agents, selectedId, streamingAgentId, onSelect, onOpenSettings, onAgentCreated }: SidebarProps) {
  const [hoveredAgent, setHoveredAgent] = useState<{ agent: AgentSummary; y: number } | null>(null)
  const [showNewAgent, setShowNewAgent] = useState(false)

  const grouped = statusOrder.reduce<Record<AgentStatus, AgentSummary[]>>(
    (acc, status) => {
      acc[status] = agents.filter((a) => a.status === status)
      return acc
    },
    { done: [], "in-review": [], "in-progress": [], backlog: [], cancelled: [] }
  )

  let globalIndex = 0
  const groupStartIndices: Partial<Record<AgentStatus, number>> = {}
  for (const status of statusOrder) {
    groupStartIndices[status] = globalIndex
    if (status !== "done" && status !== "cancelled") {
      globalIndex += grouped[status].length
    }
  }

  function handleAgentCreated(id: string) {
    setShowNewAgent(false)
    onAgentCreated(id)
  }

  return (
    <>
      <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-64 shrink-0">
        {/* Server switcher */}
        <div className="border-b border-sidebar-border shrink-0">
          <ServerSwitcher />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-sidebar-border shrink-0">
          <div className="text-[13px] font-semibold text-sidebar-foreground mb-3">Activity</div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Workspaces</span>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-xs">
                <IconFilter size={13} />
              </Button>
              <Button variant="ghost" size="icon-xs">
                <IconFolderPlus size={13} />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowNewAgent(true)}>
                <IconPlus size={13} />
              </Button>
            </div>
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-2 pt-2.5 space-y-0.5">
              {agents.length === 0 ? (
                <button
                  onClick={() => setShowNewAgent(true)}
                  className="w-full flex flex-col items-center gap-2 py-8 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  <IconSparkles size={20} />
                  <span className="text-[12px]">Create your first agent</span>
                </button>
              ) : (
                statusOrder.map((status) => (
                  <StatusGroup
                    key={status}
                    status={status}
                    agents={grouped[status]}
                    selectedId={selectedId}
                    streamingAgentId={streamingAgentId}
                    onSelect={onSelect}
                    startIndex={groupStartIndices[status] ?? 0}
                    onHover={(agent, y) => setHoveredAgent({ agent, y })}
                    onLeave={() => setHoveredAgent(null)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 border-t border-sidebar-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
              A
            </div>
            <span className="text-xs text-muted-foreground">alexmartosp</span>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onOpenSettings}>
            <IconSettings size={13} />
          </Button>
        </div>
      </div>

      {hoveredAgent && (
        <AgentPopover agent={hoveredAgent.agent} y={hoveredAgent.y} />
      )}

      {showNewAgent && (
        <NewAgentDialog onClose={() => setShowNewAgent(false)} onCreated={handleAgentCreated} />
      )}
    </>
  )
}
