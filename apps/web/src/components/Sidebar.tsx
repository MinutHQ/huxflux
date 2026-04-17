import React, { useRef, useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import * as TablerIcons from "@tabler/icons-react"
import { ScrollArea } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { cn } from "@huxflux/ui"
import { statusConfig, type AgentSummary, type AgentStatus } from "@/data/mock"
import type { PullRequest } from "@/data/mockReviews"
// PendingAgent/DeletingAgent types are inferred from useWorkspaceContext
import type { RefineSession } from "@/components/RefineView"
import { api, useRepos, markAgentDeleted } from "@huxflux/shared"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useMatchRoute } from "@tanstack/react-router"
import { useDraggable } from "@dnd-kit/core"
import { ServerSwitcher } from "@/components/ServerSwitcher"
import { AddRepoDialog, CloneRepoDialog, QuickStartDialog } from "@/components/SettingsPage"
import { FeedbackDialog } from "@/components/FeedbackDialog"
import { getFlag } from "@/lib/flags"
import { openExternal, handleExternalClick } from "@/lib/platform"
import { toast } from "sonner"
import { TitleBar } from "@/components/TitleBar"
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext"
import {
  IconChevronRight,
  IconPlus,
  IconFilter,
  IconCheck,
  IconSettings,
  IconGitBranch,
  IconFolder,
  IconFolderPlus,
  IconArrowUpRight,
  IconSparkles,
  IconGitPullRequest,
  IconGitMerge,
  IconGitPullRequestClosed,
  IconTrash,
  IconWorld,
  IconLayoutSidebarLeftCollapse,
  IconMessageCircle,
  IconFlask,
  IconTicket,
  IconQuestionMark,
  IconKeyboard,
  IconBook,
  IconX,
  IconHome,
  IconBolt,
  IconRefresh,
  IconChevronDown,
  IconPlayerPlay,
  IconPlayerStop,
  IconLoader2,
  IconLayoutKanban,
} from "@tabler/icons-react"

// ── Status icons (Linear-style) ───────────────────────────────────────────────

function StatusIcon({ status, size = 14 }: { status: AgentStatus; size?: number }) {
  const color = statusConfig[status].hex
  const cx = 7
  const cy = 7
  const r = 5.6

  switch (status) {
    case "done":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill={color} />
          <path d="M4.2 7.2 L6.2 9.2 L9.8 5.4" stroke="#1c1917" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case "in-review":
      // 3/4 pie inside a ring
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="1.4" />
          <path d={`M ${cx} ${cy} L ${cx} ${cy - r + 0.6} A ${r - 0.6} ${r - 0.6} 0 1 1 ${cx - (r - 0.6)} ${cy} Z`} fill={color} />
        </svg>
      )
    case "in-progress":
      // half pie inside a ring
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="1.4" />
          <path d={`M ${cx} ${cy - r + 0.6} A ${r - 0.6} ${r - 0.6} 0 0 1 ${cx} ${cy + r - 0.6} L ${cx} ${cy} Z`} fill={color} />
        </svg>
      )
    case "backlog":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="1.3" strokeDasharray="1.8 1.6" />
        </svg>
      )
    case "cancelled":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill={color} />
          <path d="M4.6 4.6 L9.4 9.4 M9.4 4.6 L4.6 9.4" stroke="#1c1917" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
  }
}

// ── Worktree duration tracking ────────────────────────────────────────────────

const WT_DURATION_KEY = "huxflux:worktree-durations"
const DEFAULT_DURATION_MS = 8000

function getWorktreeDuration(repoId: string): number {
  try {
    const raw = localStorage.getItem(WT_DURATION_KEY)
    if (!raw) return DEFAULT_DURATION_MS
    const map = JSON.parse(raw) as Record<string, number>
    return map[repoId] ?? DEFAULT_DURATION_MS
  } catch { return DEFAULT_DURATION_MS }
}

function saveWorktreeDuration(repoId: string, ms: number) {
  try {
    const raw = localStorage.getItem(WT_DURATION_KEY)
    const map = raw ? JSON.parse(raw) as Record<string, number> : {}
    map[repoId] = ms
    localStorage.setItem(WT_DURATION_KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}

// ── Hover popover ─────────────────────────────────────────────────────────────

function AgentPopover({ agent, y, port, sidebarWidth }: { agent: AgentSummary; y: number; port?: number | null; sidebarWidth: number }) {
  const cfg = statusConfig[agent.status]

  return createPortal(
    <div
      className="fixed z-50 w-72 bg-card border border-border rounded-xl shadow-xl p-3 pointer-events-none"
      style={{ left: sidebarWidth + 4, top: Math.max(8, y - 8) }}
    >
      <div className="flex items-start gap-2 mb-2">
        <IconGitBranch size={13} className="text-muted-foreground/50 mt-0.5 shrink-0" />
        <span className="text-[13px] font-medium text-foreground leading-snug line-clamp-2">
          {agent.title}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-2">
        <StatusIcon status={agent.status} size={12} />
        <span className={cfg.color}>{cfg.label}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="font-mono">{agent.location}</span>
        {agent.daysAgo && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{agent.daysAgo}</span>
          </>
        )}
      </div>

      {port != null && (
        <div className="flex items-center gap-1.5 text-[12px] text-emerald-400 mb-2">
          <IconWorld size={11} className="shrink-0" />
          <span>Running on port <span className="font-mono font-medium">{port}</span></span>
        </div>
      )}

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
          {agent.prStatus && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <a
                href={agent.prStatus.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
                onClick={(e) => { e.stopPropagation(); handleExternalClick(e) }}
                title={
                  agent.prStatus.merged ? "Merged"
                  : agent.prStatus.mergeableState === "dirty" ? "Merge conflict"
                  : agent.prStatus.hasChangeRequests ? "Changes requested"
                  : agent.prStatus.mergeableState === "clean" ? "Ready to merge"
                  : agent.prStatus.state === "open" && !agent.prStatus.draft && agent.prStatus.mergeableState !== "clean" ? "Blocked"
                  : `PR #${agent.prStatus.number}`
                }
              >
                {agent.prStatus.merged ? (
                  <IconGitMerge size={12} className="text-purple-400" />
                ) : agent.prStatus.mergeableState === "dirty" ? (
                  <TablerIcons.IconAlertTriangle size={12} className="text-red-400" />
                ) : agent.prStatus.hasChangeRequests ? (
                  <TablerIcons.IconMessageX size={12} className="text-orange-400" />
                ) : agent.prStatus.mergeableState === "clean" ? (
                  <IconCheck size={12} className="text-emerald-400" />
                ) : agent.prStatus.state === "open" && !agent.prStatus.draft && agent.prStatus.mergeableState !== "clean" ? (
                  <TablerIcons.IconShieldX size={12} className="text-yellow-400" />
                ) : (
                  <IconGitPullRequest size={12} className="text-muted-foreground/60" />
                )}
                <span className="text-muted-foreground/60">#{agent.prStatus.number}</span>
              </a>
            </>
          )}
        </div>
      )}

      <div className={cn(
        "w-full flex items-center justify-center px-3 py-1.5 rounded-lg text-[12px] font-medium border",
        agent.status === "in-progress" && "bg-amber-500/10 border-amber-500/25 text-amber-400",
        agent.status === "in-review"   && "bg-blue-500/10 border-blue-500/25 text-blue-400",
        agent.status === "done"        && "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
        agent.status === "backlog"     && "bg-zinc-500/10 border-zinc-500/25 text-zinc-400",
        agent.status === "cancelled"   && "bg-red-500/10 border-red-500/25 text-red-400",
      )}>
        {cfg.label}
      </div>
    </div>,
    document.body
  )
}

// ── New agent dialog ──────────────────────────────────────────────────────────

const BEE_ADJECTIVES = [
  "golden", "amber", "clover", "lavender", "sage", "thyme", "meadow",
  "misty", "swift", "bright", "busy", "wild", "pollen", "honey", "wax",
  "violet", "royal", "fuzzy", "striped", "sunlit", "drowsy", "hazy",
  "nimble", "plucky", "eager", "dusky", "velvet", "copper", "crimson",
  "ivory", "marbled", "silken", "frosted", "glossy", "humming", "dappled",
  "quiet", "restless", "brisk", "gentle", "wistful", "weary", "jolly",
  "quirky", "zesty", "tangy", "sugary", "minty", "buttery", "dusty",
  "earthen", "rustic", "woodland", "linen", "willow", "cedar", "juniper",
  "hazel", "birch", "rowan", "maple", "ember", "mossy", "fernlike",
  "breezy", "sunny", "stormy", "cloudy", "starlit", "moonlit", "dawnlit",
]
const BEE_NOUNS = [
  "scout", "forager", "guard", "worker", "drone", "nurse", "harvester",
  "wanderer", "pilgrim", "ranger", "keeper", "seeker", "drifter", "carrier",
  "gatherer", "builder", "mender", "tender", "weaver", "dancer", "singer",
  "climber", "flier", "rover", "hunter", "tracker", "watcher", "herald",
  "courier", "runner", "sifter", "sorter", "tinker", "cobbler", "scribe",
  "sage", "mystic", "dreamer", "poet", "jester", "acrobat", "trickster",
  "nomad", "voyager", "sailor", "captain", "mariner", "pathfinder", "shepherd",
  "gardener", "baker", "brewer", "smith", "potter", "carver", "painter",
]

function randomBeeName(): string {
  const adj = BEE_ADJECTIVES[Math.floor(Math.random() * BEE_ADJECTIVES.length)]
  const noun = BEE_NOUNS[Math.floor(Math.random() * BEE_NOUNS.length)]
  // 5-char base36 suffix adds ~60M possibilities per (adj, noun) pair,
  // making collisions astronomically unlikely and preventing stale-branch
  // name reuse from false-positive "already merged" detection.
  const suffix = Math.random().toString(36).slice(2, 7).padStart(5, "0")
  return `${adj}-${noun}-${suffix}`
}

function NewAgentPopover({
  onClose,
  onSelect,
  anchorRef,
}: {
  onClose: () => void
  onSelect: (repoId: string, title: string, branch: string, direct: boolean) => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const [direct, setDirect] = useState(false)
  const { data: repos = [] } = useRepos()

  const pos = anchorRef.current?.getBoundingClientRect()

  function handleSelectRepo(repoId: string) {
    const name = randomBeeName()
    const repo = repos.find((r) => r.id === repoId)
    const prefix = repo?.branchPrefix ? repo.branchPrefix.replace(/\/$/, "") + "/" : "agent/"
    const branch = `${prefix}${name}`
    onSelect(repoId, name, branch, direct)
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
        style={{
          top: pos ? pos.bottom + 6 : 100,
          left: pos ? Math.max(8, pos.right - 224) : 100,
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
          if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
            const idx = parseInt(e.key) - 1
            if (idx < repos.length) handleSelectRepo(repos[idx].id)
          }
        }}
      >
        {repos.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/50">
            No repositories yet.<br />Add one in Settings first.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 p-1 border-b border-border">
              <button
                onClick={() => setDirect(false)}
                className={cn(
                  "flex-1 text-[11px] font-medium py-1 rounded-md transition-colors",
                  !direct ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Worktree
              </button>
              <button
                onClick={() => setDirect(true)}
                className={cn(
                  "flex-1 text-[11px] font-medium py-1 rounded-md transition-colors",
                  direct ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Direct
              </button>
            </div>
            <div className="p-1 space-y-0.5">
              {repos.map((r, i) => {
                const shortcut = i < 9 ? i + 1 : null
                return (
                  <button
                    key={r.id}
                    autoFocus={i === 0}
                    onClick={() => handleSelectRepo(r.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors hover:bg-accent/60 text-foreground"
                  >
                    <span className={cn("w-5 h-5 rounded border text-[10px] font-bold flex items-center justify-center shrink-0", repoColor(r.name))}>
                      {(() => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const IconComp = r.icon ? (TablerIcons as any)[r.icon] as React.ComponentType<{ size?: number }> | undefined : undefined
                        return IconComp ? <IconComp size={11} /> : r.name[0].toUpperCase()
                      })()}
                    </span>
                    <span className="text-[12px] font-medium flex-1 truncate">
                      {r.name}
                    </span>
                    {shortcut && (
                      <span className="text-[11px] text-muted-foreground/40 font-mono tabular-nums shrink-0">
                        {shortcut}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  )
}

// ── Repo color ────────────────────────────────────────────────────────────────

const repoColors = [
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "bg-teal-500/20 text-teal-400 border-teal-500/30",
]

function repoColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % repoColors.length
  return repoColors[hash]
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

const visibleStatuses: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]

function StatusContextMenu({
  x,
  y,
  agent,
  onClose,
  onDelete,
}: {
  x: number
  y: number
  agent: AgentSummary
  onClose: () => void
  onDelete: (agent: AgentSummary) => void
}) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    setPos({
      x: Math.min(x, window.innerWidth - w - 8),
      y: Math.min(y, window.innerHeight - h - 8),
    })
  }, [])

  async function handleSetStatus(status: AgentStatus) {
    onClose()
    if (status === agent.status) return
    await api.updateAgent(agent.id, { status })
    queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) =>
      old ? old.map((a) => a.id === agent.id ? { ...a, status } : a) : old
    )
  }

  async function handleGenerateTitle() {
    onClose()
    try {
      const updated = await api.generateTitle(agent.id)
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, title: updated.title } : a) : old
      )
    } catch {
      toast.error("Failed to generate title")
    }
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onClose()
    onDelete(agent)
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={menuRef}
        className="fixed z-50 w-44 bg-card border border-border rounded-lg shadow-xl overflow-hidden py-1"
        style={{ top: pos?.y ?? y, left: pos?.x ?? x, visibility: pos ? "visible" : "hidden" }}
      >
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">
          Set status
        </div>
        {visibleStatuses.map((status) => {
          const cfg = statusConfig[status]
          return (
            <button
              key={status}
              onClick={() => handleSetStatus(status)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/60 transition-colors"
            >
              <StatusIcon status={status} size={13} />
              <span className={cn("flex-1 text-left", cfg.color)}>{cfg.label}</span>
              {agent.status === status && <IconCheck size={12} className="text-muted-foreground/60" />}
            </button>
          )
        })}
        <div className="border-t border-border my-1" />
        <button
          onClick={handleGenerateTitle}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/60 transition-colors"
        >
          <IconSparkles size={13} className="text-muted-foreground/60 shrink-0" />
          <span className="flex-1 text-left">Generate title</span>
        </button>
        <div className="border-t border-border my-1" />
        <button
          onClick={handleDelete}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <IconTrash size={13} className="shrink-0" />
          <span className="flex-1 text-left">{confirmDelete ? "Confirm delete" : "Delete"}</span>
        </button>
      </div>
    </>,
    document.body
  )
}

function PrIcon({ agent }: { agent: AgentSummary }) {
  const pr = agent.prStatus
  if (!pr) {
    return <IconGitBranch size={11} className="text-muted-foreground/30 shrink-0" />
  }
  if (pr.merged) {
    return <IconGitMerge size={11} className="text-purple-400/70 shrink-0" />
  }
  if (pr.state === "closed") {
    return <IconGitPullRequestClosed size={11} className="text-red-400/70 shrink-0" />
  }
  if (pr.mergeableState === "dirty") {
    return <TablerIcons.IconAlertTriangle size={11} className="text-red-400/80 shrink-0" />
  }
  if (pr.hasChangeRequests) {
    return <TablerIcons.IconMessageX size={11} className="text-orange-400/80 shrink-0" />
  }
  if (pr.mergeableState === "clean") {
    return <IconCheck size={11} className="text-emerald-400/70 shrink-0" />
  }
  if (pr.draft) {
    return <IconGitPullRequest size={11} className="text-muted-foreground/30 shrink-0" />
  }
  if (pr.state === "open" && !pr.draft) {
    return <TablerIcons.IconShieldX size={11} className="text-yellow-400/70 shrink-0" />
  }
  return <IconGitPullRequest size={11} className="text-muted-foreground/60 shrink-0" />
}

const AgentRow = React.memo(function AgentRow({
  agent,
  isSelected,
  isStreaming,
  onClick,
  onHover,
  onLeave,
  onDelete,
  port,
  repoName,
  repoIcon,
}: {
  agent: AgentSummary
  isSelected: boolean
  isStreaming: boolean
  onClick: () => void
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
  onDelete: (agent: AgentSummary) => void
  port?: number | null
  repoName?: string
  repoIcon?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const avatarColor = repoName ? repoColor(repoName) : (modelColors[agent.model] ?? "bg-muted text-muted-foreground")
  const initials = (repoName ?? agent.title)[0].toUpperCase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const RepoIconComp = repoIcon ? (TablerIcons as any)[repoIcon] as React.ComponentType<{ size?: number }> | undefined : undefined
  const isCancelled = agent.status === "cancelled"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `agent-drag-${agent.id}`,
    data: { agentId: agent.id, title: agent.title },
  })

  function handleMouseEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      onHover(agent, rect.top)
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
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
    queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) =>
      old ? old.map((a) => a.id === agent.id ? { ...a, title } : a) : old
    )
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <>
      <button
        ref={(el) => { (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el; setDragRef(el) }}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={onLeave}
        {...listeners}
        {...attributes}
        className={cn(
          "w-full min-w-0 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-all",
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground",
          isCancelled && "opacity-50",
          isDragging && "opacity-30"
        )}
      >
        <div className={cn("w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0", avatarColor)}>
          {RepoIconComp ? <RepoIconComp size={11} /> : initials}
        </div>
        {isStreaming ? <StreamingDots /> : <PrIcon agent={agent} />}
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
              isCancelled && "line-through",
              !isSelected && !!agent.unread && "font-semibold text-foreground"
            )}
          >
            {agent.title}
          </span>
        )}
        {port != null && !editing && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse"
            title={`Running on :${port}`}
          />
        )}
      </button>
      {contextMenu && (
        <StatusContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          agent={agent}
          onClose={() => setContextMenu(null)}
          onDelete={onDelete}
        />
      )}
    </>
  )
})

// ── Pending agent row ─────────────────────────────────────────────────────────

function PendingAgentRow({ title, repoName }: { title: string; repoName: string }) {
  const avatarColor = repoName ? repoColor(repoName) : "bg-muted text-muted-foreground"
  const initials = (repoName || title)[0].toUpperCase()

  return (
    <div className="w-full min-w-0 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
      <div className={cn("w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0", avatarColor)}>
        {initials}
      </div>
      <svg width="11" height="11" viewBox="0 0 11 11" className="text-amber-400 shrink-0 animate-spin">
        <circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="12 13" strokeLinecap="round" />
      </svg>
      <span className="text-xs flex-1 min-w-0 truncate leading-tight font-semibold">
        {title}
      </span>
    </div>
  )
}

// ── Status group ──────────────────────────────────────────────────────────────

function StatusGroup({
  status,
  agents,
  selectedId,
  onSelect,
  onHover,
  onLeave,
  onDelete,
  onArchiveAll,
  agentPorts,
  repoNames,
  repoIcons,
}: {
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
}) {
  const [collapsed, setCollapsed] = useState(status === "done")
  const config = statusConfig[status]

  return (
    <div className="mb-2.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
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
              repoName={agent.repoId ? repoNames[agent.repoId] : undefined}
              repoIcon={agent.repoId ? repoIcons?.[agent.repoId] : undefined}
            />
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

// ── Repo group ───────────────────────────────────────────────────────────────

function RepoGroup({
  repoName,
  agents,
  selectedId,
  onSelect,
  onHover,
  onLeave,
  onDelete,
  agentPorts,
}: {
  repoName: string
  agents: AgentSummary[]
  selectedId: string
  onSelect: (id: string) => void
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
  onDelete: (agent: AgentSummary) => void
  agentPorts?: Record<string, number | null>
}) {
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add workspace popover ────────────────────────────────────────────────────

function AddWorkspacePopover({
  onClose,
  onOpenProject,
  onClone,
  onQuickStart,
  anchorRef,
}: {
  onClose: () => void
  onOpenProject: () => void
  onClone: () => void
  onQuickStart: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const pos = anchorRef.current?.getBoundingClientRect()

  const items = [
    { icon: IconFolder, label: "Open project", onClick: onOpenProject },
    { icon: IconWorld, label: "Clone from URL", onClick: onClone },
    { icon: IconBolt, label: "Quick start", onClick: onQuickStart },
  ]

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden py-1"
        style={{
          top: pos ? pos.bottom + 6 : 100,
          left: pos ? Math.max(8, pos.right - 192) : 100,
        }}
      >
        {items.map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            onClick={() => { onClose(); onClick() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-foreground hover:bg-accent/60 transition-colors text-left"
          >
            <Icon size={13} className="text-muted-foreground/60 shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </>,
    document.body
  )
}

// ── Filter popover ───────────────────────────────────────────────────────────

type GroupByMode = "status" | "repo"

function FilterPopover({
  groupBy,
  onGroupByChange,
  repoFilter,
  onRepoFilterChange,
  repos,
  onClose,
  anchorRef,
}: {
  groupBy: GroupByMode
  onGroupByChange: (mode: GroupByMode) => void
  repoFilter: string
  onRepoFilterChange: (repoId: string) => void
  repos: { id: string; name: string }[]
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const [groupByOpen, setGroupByOpen] = useState(false)
  const [repoOpen, setRepoOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const pos = anchorRef.current?.getBoundingClientRect()

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={popoverRef}
        className="fixed z-50 w-64 bg-card border border-border rounded-xl shadow-xl p-3 space-y-3"
        style={{
          top: pos ? pos.bottom + 6 : 100,
          left: pos ? Math.max(8, pos.left - 100) : 100,
        }}
      >
        {/* Group by */}
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">Group by</span>
          <div className="relative">
            <button
              onClick={() => { setGroupByOpen(!groupByOpen); setRepoOpen(false) }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-[12px] font-medium text-foreground hover:bg-accent/60 transition-colors min-w-[90px] justify-between"
            >
              {groupBy === "status" ? "Status" : "Repo"}
              <IconChevronRight size={10} className={cn("text-muted-foreground/60 transition-transform", groupByOpen && "rotate-90")} />
            </button>
            {groupByOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
                {(["status", "repo"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { onGroupByChange(mode); setGroupByOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent/60 transition-colors"
                  >
                    {groupBy === mode ? <IconCheck size={12} /> : <span className="w-3" />}
                    {mode === "status" ? "Status" : "Repo"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Repo filter */}
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">Repo</span>
          <div className="relative">
            <button
              onClick={() => { setRepoOpen(!repoOpen); setGroupByOpen(false) }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-[12px] font-medium text-foreground hover:bg-accent/60 transition-colors min-w-[90px] justify-between"
            >
              <span className="truncate">
                {repoFilter === "all" ? "All repos" : repos.find((r) => r.id === repoFilter)?.name ?? "All repos"}
              </span>
              <IconChevronRight size={10} className={cn("text-muted-foreground/60 transition-transform", repoOpen && "rotate-90")} />
            </button>
            {repoOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
                <button
                  onClick={() => { onRepoFilterChange("all"); setRepoOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent/60 transition-colors"
                >
                  {repoFilter === "all" ? <IconCheck size={12} /> : <span className="w-3" />}
                  All repos
                </button>
                {repos.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { onRepoFilterChange(r.id); setRepoOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent/60 transition-colors"
                  >
                    {repoFilter === r.id ? <IconCheck size={12} /> : <span className="w-3" />}
                    <span className="truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// ── Help popover + keyboard shortcuts ────────────────────────────────────────

const KEYBOARD_SHORTCUTS = [
  { group: "General", label: "Toggle sidebar", keys: ["⌘", "B"] },
  { group: "General", label: "Toggle terminal", keys: ["F1"] },
  { group: "General", label: "New agent", keys: ["⌘", "N"] },
  { group: "General", label: "Open settings", keys: ["⌘", ","] },
  { group: "General", label: "Keyboard shortcuts", keys: ["⌘", "/"] },
  { group: "Chat", label: "Send message", keys: ["↵"] },
  { group: "Chat", label: "New line", keys: ["⇧", "↵"] },
  { group: "Chat", label: "Attach file", keys: ["⌘", "U"] },
  { group: "Chat", label: "Open in editor", keys: ["⌘", "O"] },
  { group: "Editor", label: "Save file", keys: ["⌘", "S"] },
  { group: "Editor", label: "Cancel edit", keys: ["Esc"] },
]

function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const filtered = KEYBOARD_SHORTCUTS.filter((s) =>
    !search || s.label.toLowerCase().includes(search.toLowerCase())
  )
  const groups = [...new Set(filtered.map((s) => s.group))]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-[480px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Keyboard shortcuts</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <IconX size={14} />
          </button>
        </div>
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2 bg-background rounded-lg border border-border px-3 py-1.5">
            <IconFilter size={13} className="text-muted-foreground/50 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search shortcuts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-muted-foreground/40">No shortcuts found</div>
          ) : groups.map((group) => (
            <div key={group}>
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{group}</span>
              </div>
              {filtered.filter((s) => s.group === group).map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/40 transition-colors">
                  <span className="text-[13px] text-foreground">{s.label}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((key, ki) => (
                      <kbd key={ki} className="px-1.5 py-0.5 rounded border border-border bg-background text-[11px] font-mono text-muted-foreground min-w-[24px] text-center">
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

function HelpPopover({ feedbackEnabled, onFeedback, onClose, onShowShortcuts, anchorRef }: {
  feedbackEnabled: boolean
  onFeedback: () => void
  onClose: () => void
  onShowShortcuts: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const pos = anchorRef.current?.getBoundingClientRect()

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-52 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
        style={{
          bottom: pos ? window.innerHeight - pos.top + 6 : 100,
          left: pos ? Math.max(8, pos.left - 8) : 100,
        }}
      >
        <div className="p-1">
          {feedbackEnabled && (
            <button
              onClick={() => { onClose(); onFeedback() }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left text-[12px] text-foreground"
            >
              <IconMessageCircle size={13} className="text-muted-foreground shrink-0" />
              Send feedback
            </button>
          )}
          <button
            onClick={() => { onShowShortcuts(); onClose() }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left text-[12px] text-foreground"
          >
            <IconKeyboard size={13} className="text-muted-foreground shrink-0" />
            Keyboard shortcuts
          </button>
          <button
            onClick={() => { openExternal("https://huxflux-docs.netlify.app/docs"); onClose() }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left text-[12px] text-foreground"
          >
            <IconBook size={13} className="text-muted-foreground shrink-0" />
            Documentation
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

// ── PR row ────────────────────────────────────────────────────────────────────

function PRPopover({ pr, y, sidebarWidth }: { pr: PullRequest; y: number; sidebarWidth: number }) {
  return createPortal(
    <div
      className="fixed z-50 w-72 bg-card border border-border rounded-xl shadow-xl p-3 pointer-events-none"
      style={{ left: sidebarWidth + 4, top: Math.max(8, y - 8) }}
    >
      <div className="flex items-start gap-2 mb-2">
        <IconGitPullRequest size={13} className="text-muted-foreground/50 mt-0.5 shrink-0" />
        <span className="text-[13px] font-medium text-foreground leading-snug">
          {pr.title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="font-mono text-muted-foreground/50">#{pr.number}</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{pr.author}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="text-muted-foreground/60">{pr.requestedAt}</span>
      </div>
      {pr.branch && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/50">
          <IconGitBranch size={11} className="shrink-0" />
          {pr.branch}
        </div>
      )}
    </div>,
    document.body
  )
}

function PRRow({ pr, isSelected, onClick, onHover, onLeave, isBulkReviewing = false }: {
  pr: PullRequest
  isSelected: boolean
  onClick: () => void
  onHover: (y: number) => void
  onLeave: () => void
  isBulkReviewing?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseEnter() {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) onHover(rect.top)
  }

  const statusBorderColor = pr.reviewRequested && pr.userReviewed
    ? "border-l-amber-400/60"
    : pr.reviewStatus === "approved"
    ? "border-l-emerald-400/60"
    : "border-l-transparent"

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      className="w-full min-w-0"
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full min-w-0 flex items-start gap-2.5 px-2 py-2 rounded-md transition-all text-left border-l-2",
          statusBorderColor,
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground"
        )}
      >
        {/* Avatar */}
        <div className="relative shrink-0 mt-0.5">
          {pr.authorAvatar ? (
            <img src={pr.authorAvatar} alt={pr.author} className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground/60 uppercase">
              {pr.author?.slice(0, 1) ?? "?"}
            </div>
          )}
          {isBulkReviewing ? (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-background flex items-center justify-center">
              <IconLoader2 size={10} className="animate-spin text-primary" />
            </div>
          ) : pr.reviewReady && !pr.userReviewed ? (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-background flex items-center justify-center">
              <IconSparkles size={10} className="text-amber-400" />
            </div>
          ) : null}
        </div>
        {/* Text content */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* Title */}
          <span className={cn(
            "text-[12px] leading-snug truncate min-w-0",
            isSelected ? "font-semibold text-foreground" : "text-foreground/80",
            pr.unread && "font-semibold"
          )}>
            {pr.unread && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1.5 mb-0.5 shrink-0" />}
            {pr.title}
          </span>
          {/* Number + author + date */}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">#{pr.number}</span>
            {pr.author && <>
              <span className="text-[10px] text-muted-foreground/30 shrink-0">·</span>
              <span className="text-[10px] text-muted-foreground/60 truncate">{pr.author}</span>
            </>}
            <span className="text-[10px] text-muted-foreground/30 shrink-0">·</span>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">{pr.requestedAt}</span>
          </div>
          {/* Branch */}
          {(pr.baseBranch || pr.branch) && (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] font-mono text-muted-foreground/40 truncate">
                {pr.baseBranch} ← {pr.branch}
              </span>
            </div>
          )}
        </div>
      </button>
    </div>
  )
}

// ── PR list ───────────────────────────────────────────────────────────────────

function PRList({ prsLoading, prs, hideReviewedPrs, selectedPrId, onSelectPr, onHover, onLeave, bulkReviewingIds = new Set() }: {
  prsLoading: boolean
  prs: PullRequest[]
  hideReviewedPrs: boolean
  selectedPrId: string | null
  onSelectPr: (id: string) => void
  onHover: (pr: PullRequest, y: number) => void
  onLeave: () => void
  bulkReviewingIds?: Set<string>
}) {
  const [repoFilter, setRepoFilter] = useState<string | null>(null)

  if (prsLoading) {
    return (
      <div className="p-2 space-y-1">
        {[72, 88, 64, 80].map((w, i) => (
          <div key={i} className="px-2.5 py-1.5 space-y-1.5 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-muted/30 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 rounded bg-muted/50 animate-pulse" style={{ width: `${w}%` }} />
              <div className="h-2 rounded bg-muted/30 animate-pulse w-2/5" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Derive unique repo names for filter pills
  const repoNames = [...new Set(prs.map((p) => p.repo).filter(Boolean))]

  const filteredByRepo = repoFilter ? prs.filter((p) => p.repo === repoFilter) : prs
  const visiblePrs = hideReviewedPrs ? filteredByRepo.filter((p) => !p.isReadyToMerge) : filteredByRepo
  const reRequested = visiblePrs.filter((p) => p.reviewRequested && p.userReviewed)
  const toReview = visiblePrs.filter((p) => !p.userReviewed)
  const userReviewed = visiblePrs.filter((p) => p.userReviewed && !p.reviewRequested)

  return (
    <div className="flex flex-col">
      {/* Repo filter pills */}
      {repoNames.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-2 flex-wrap border-b border-sidebar-border">
          <button
            onClick={() => setRepoFilter(null)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
              repoFilter === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            )}
          >
            All
          </button>
          {repoNames.map((name) => (
            <button
              key={name}
              onClick={() => setRepoFilter(repoFilter === name ? null : name)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[120px]",
                repoFilter === name
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              )}
            >
              {name.split("/").pop() ?? name}
            </button>
          ))}
        </div>
      )}

      {visiblePrs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground/40">
          <IconGitPullRequest size={20} />
          <span className="text-[12px]">No PRs to review</span>
        </div>
      ) : (
        <div className="p-2 space-y-0.5">
          <PRGroup label="Re-requested" labelColor="text-amber-400/80" prs={reRequested} selectedPrId={selectedPrId} onSelectPr={onSelectPr} onHover={onHover} onLeave={onLeave} bulkReviewingIds={bulkReviewingIds} />
          <PRGroup label="Review requested" labelColor="text-muted-foreground/50" prs={toReview} selectedPrId={selectedPrId} onSelectPr={onSelectPr} onHover={onHover} onLeave={onLeave} bulkReviewingIds={bulkReviewingIds} />
          <PRGroup label="Reviewed" labelColor="text-muted-foreground/40" prs={userReviewed} selectedPrId={selectedPrId} onSelectPr={onSelectPr} onHover={onHover} onLeave={onLeave} defaultCollapsed bulkReviewingIds={bulkReviewingIds} />
        </div>
      )}
    </div>
  )
}

// ── PR group (accordion) ─────────────────────────────────────────────────────

function PRGroup({ label, labelColor, prs, selectedPrId, onSelectPr, onHover, onLeave, defaultCollapsed = false, bulkReviewingIds = new Set() }: {
  label: string
  labelColor: string
  prs: PullRequest[]
  selectedPrId: string | null
  onSelectPr: (id: string) => void
  onHover: (pr: PullRequest, y: number) => void
  onLeave: () => void
  defaultCollapsed?: boolean
  bulkReviewingIds?: Set<string>
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  if (prs.length === 0) return null
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
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", labelColor)}>{label}</span>
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-0.5 px-1 min-w-0 overflow-hidden">
          {prs.map((pr) => (
            <PRRow
              key={pr.id}
              pr={pr}
              isSelected={selectedPrId === pr.id}
              onClick={() => onSelectPr(pr.id)}
              onHover={(y) => onHover(pr, y)}
              onLeave={onLeave}
              isBulkReviewing={bulkReviewingIds.has(pr.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── PR filter popover ────────────────────────────────────────────────────────

function PRFilterPopover({ hideReviewed, onToggleHideReviewed, onClose, anchorRef, concurrency, onConcurrencyChange }: {
  hideReviewed: boolean
  onToggleHideReviewed: () => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
  concurrency: number
  onConcurrencyChange?: (n: number) => void
}) {
  const pos = anchorRef.current?.getBoundingClientRect()
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-56 bg-card border border-border rounded-xl shadow-xl p-3 space-y-2"
        style={{
          top: pos ? pos.bottom + 6 : 100,
          left: pos ? Math.max(8, pos.right - 224) : 100,
        }}
      >
        <button
          onClick={onToggleHideReviewed}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left"
        >
          <div className={cn(
            "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
            hideReviewed ? "bg-primary border-primary" : "border-border bg-background"
          )}>
            {hideReviewed && <IconCheck size={10} className="text-primary-foreground" />}
          </div>
          <span className="text-[12px] text-foreground">Hide PRs ready to merge</span>
        </button>
        {onConcurrencyChange && (
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-muted-foreground/60">Concurrent reviews</span>
              <span className="text-[11px] font-mono text-foreground/80">{concurrency}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => onConcurrencyChange(parseInt(e.target.value, 10))}
              className="w-full h-1 accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground/40 mt-0.5">
              <span>1</span>
              <span>10</span>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

interface SidebarProps {
  agents: AgentSummary[]
  onOpenSettings: () => void
  prs: PullRequest[]
  prsLoading?: boolean
  onRefetchPRs?: () => void
  refineSessions?: RefineSession[]
  onNewRefine?: (ticketId: string) => void
  onToggle?: () => void
  feedbackEnabled?: boolean
  bulkReviewingIds?: Set<string>
  isBulkReviewing?: boolean
  onBulkReview?: () => void
  onCancelBulkReview?: () => void
  bulkReviewConcurrency?: number
  onBulkReviewConcurrencyChange?: (n: number) => void
}

export function Sidebar({ agents, onOpenSettings, prs, prsLoading = false, onRefetchPRs, refineSessions = [], onNewRefine, onToggle, feedbackEnabled = false, bulkReviewingIds = new Set(), isBulkReviewing = false, onBulkReview, onCancelBulkReview, bulkReviewConcurrency = 5, onBulkReviewConcurrencyChange }: SidebarProps) {
  const [hoveredAgent, setHoveredAgent] = useState<{ agent: AgentSummary; y: number } | null>(null)
  const [hoveredPr, setHoveredPr] = useState<{ pr: PullRequest; y: number } | null>(null)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [showAddWorkspace, setShowAddWorkspace] = useState(false)
  const [showAddRepo, setShowAddRepo] = useState(false)
  const [showCloneRepo, setShowCloneRepo] = useState(false)
  const [showQuickStart, setShowQuickStart] = useState(false)
  const addWorkspaceBtnRef = useRef<HTMLButtonElement>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [groupBy, setGroupByRaw] = useState<GroupByMode>(() => (localStorage.getItem("hive:sidebar:groupBy") as GroupByMode) || "status")
  const setGroupBy = (v: GroupByMode) => { setGroupByRaw(v); localStorage.setItem("hive:sidebar:groupBy", v) }
  const [repoFilter, setRepoFilterRaw] = useState(() => localStorage.getItem("hive:sidebar:repoFilter") || "all")
  const setRepoFilter = (v: string) => { setRepoFilterRaw(v); localStorage.setItem("hive:sidebar:repoFilter", v) }
  const [tab, setTabRaw] = useState<"agents" | "review" | "refine">(() => (localStorage.getItem("hive:sidebar:tab") as "agents" | "review" | "refine") || "agents")
  const setTab = (v: "agents" | "review" | "refine") => { setTabRaw(v); localStorage.setItem("hive:sidebar:tab", v) }
  const [newRefineInput, setNewRefineInput] = useState("")
  const [showNewRefine, setShowNewRefine] = useState(false)
  const [hideReviewedPrs, setHideReviewedPrsRaw] = useState(() => localStorage.getItem("hive:sidebar:hideReviewedPrs") === "true")
  const setHideReviewedPrs = (v: boolean | ((prev: boolean) => boolean)) => {
    setHideReviewedPrsRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      localStorage.setItem("hive:sidebar:hideReviewedPrs", String(next))
      return next
    })
  }
  const [showPrFilter, setShowPrFilter] = useState(false)
  const prFilterBtnRef = useRef<HTMLButtonElement>(null)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const newAgentBtnRef = useRef<HTMLButtonElement>(null)
  const helpBtnRef = useRef<HTMLButtonElement>(null)
  const sidebarContainerRef = useRef<HTMLDivElement>(null)
  const { data: repos = [] } = useRepos()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const workspace = useWorkspaceContext()

  // Derive active state from route
  const showHome = !!matchRoute({ to: "/", fuzzy: false })
  const showTasks = !!matchRoute({ to: "/tasks", fuzzy: true })
  const agentMatch = matchRoute({ to: "/agent/$agentId", fuzzy: false }) as { agentId: string } | false
  const selectedId = agentMatch ? agentMatch.agentId : ""
  const reviewMatch = matchRoute({ to: "/review/$prId", fuzzy: false }) as { prId: string } | false
  const selectedPrId = reviewMatch ? reviewMatch.prId : null
  const refineMatch = matchRoute({ to: "/refine/$sessionId", fuzzy: false }) as { sessionId: string } | false
  const selectedRefineId = refineMatch ? refineMatch.sessionId : null

  const { pendingAgent, onAgentCreating, onAgentCreated, clearPendingAgent, onAgentDeleting, clearDeletingAgent } = workspace
  const agentPorts: Record<string, number | null> = {}

  // Navigation helpers
  const onSelect = (id: string) => navigate({ to: "/agent/$agentId", params: { agentId: id } })
  const onSelectPr = (id: string) => navigate({ to: "/review/$prId", params: { prId: id } })
  const onSelectRefine = (id: string) => navigate({ to: "/refine/$sessionId", params: { sessionId: id } })

  useEffect(() => {
    function onOpenShortcuts() { setShowShortcuts(true) }
    function onNewAgent() { setShowNewAgent(true) }
    window.addEventListener("huxflux:open-shortcuts", onOpenShortcuts)
    window.addEventListener("huxflux:new-agent", onNewAgent)
    return () => {
      window.removeEventListener("huxflux:open-shortcuts", onOpenShortcuts)
      window.removeEventListener("huxflux:new-agent", onNewAgent)
    }
  }, [])

  const prReviewEnabled = getFlag("prReview")
  const refineEnabled = getFlag("refine")
  const tasksEnabled = getFlag("tasks")
  const unreadPrCount = prs.filter((p) => p.unread).length

  // Filter agents by repo
  const filteredAgents = useMemo(
    () => repoFilter === "all" ? agents : agents.filter((a) => a.repoId === repoFilter),
    [agents, repoFilter]
  )

  // Group by status
  const grouped = useMemo(
    () => visibleStatuses.reduce<Record<string, AgentSummary[]>>(
      (acc, status) => {
        acc[status] = filteredAgents.filter((a) => a.status === status)
        return acc
      },
      {}
    ) as Record<AgentStatus, AgentSummary[]>,
    [filteredAgents]
  )

  // Repo name lookup map (repoId → name)
  const repoNames = useMemo(
    () => Object.fromEntries(repos.map((r) => [r.id, r.name])),
    [repos]
  )

  // Repo icon lookup map (repoId → icon name)
  const repoIcons = useMemo(
    () => Object.fromEntries(repos.map((r) => [r.id, r.icon])),
    [repos]
  )

  // Group by repo
  const repoGrouped = useMemo(() => {
    const map = new Map<string, { name: string; agents: AgentSummary[] }>()
    for (const agent of filteredAgents) {
      const repoId = agent.repoId ?? "unknown"
      const repoName = repos.find((r) => r.id === repoId)?.name ?? agent.location ?? "Unknown"
      let entry = map.get(repoId)
      if (!entry) {
        entry = { name: repoName, agents: [] }
        map.set(repoId, entry)
      }
      entry.agents.push(agent)
    }
    return Array.from(map.entries()).map(([id, { name, agents: a }]) => ({ id, name, agents: a }))
  }, [filteredAgents, repos])

  async function handleCreateAgent(repoId: string, title: string, branch: string, direct: boolean, existingBranch?: boolean) {
    setShowNewAgent(false)
    const repoName = repos.find(r => r.id === repoId)?.name ?? ""
    const savedMs = getWorktreeDuration(repoId)
    onAgentCreating({ title, branch, repoName, estimatedMs: savedMs })
    navigate({ to: "/agent/setup" })
    const t0 = Date.now()
    try {
      const agent = await api.createAgent({
        title,
        branch,
        repoId,
        noWorktree: direct || undefined,
        existingBranch: existingBranch || undefined,
      })
      saveWorktreeDuration(repoId, Date.now() - t0)
      onAgentCreated(agent.id)
      navigate({ to: "/agent/$agentId", params: { agentId: agent.id } })
    } catch (err) {
      toast.error((err as Error).message || "Failed to create agent")
      clearPendingAgent()
      navigate({ to: "/" })
    }
  }

  function handleDeleteAgent(agent: AgentSummary) {
    const repoName = agent.repoId ? (repos.find(r => r.id === agent.repoId)?.name ?? "") : ""
    onAgentDeleting(agent.id, { title: agent.title, branch: agent.branch, repoName })
    navigate({ to: "/agent/teardown" })
    // Tombstone the id so a late `agent:updated` event can't resurrect it
    // before the server's `agent:deleted` broadcast arrives.
    markAgentDeleted(agent.id)
    // Optimistically remove from sidebar immediately.
    // Use setQueriesData with prefix matching because useAgents keys its
    // query as ["agents", serverUrl] — an exact ["agents"] write would miss.
    queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) =>
      old ? old.filter((a) => a.id !== agent.id) : old
    )
    // Fire API in background — don't block the UI
    api.deleteAgent(agent.id).catch((err) =>
      toast.error(`Delete failed: ${err instanceof Error ? err.message : "unknown"}`)
    )
    // Clear animation after it finishes
    setTimeout(() => { clearDeletingAgent(); navigate({ to: "/" }) }, 1500)
  }

  function handleArchiveAll(status: AgentStatus) {
    const targets = (grouped[status] ?? [])
    if (targets.length === 0) return
    const ids = targets.map((a) => a.id)
    // Optimistically remove all from sidebar
    for (const id of ids) markAgentDeleted(id)
    queryClient.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (old) =>
      old ? old.filter((a) => !ids.includes(a.id)) : old
    )
    // Fire deletes in background
    for (const id of ids) {
      api.deleteAgent(id).catch((err) =>
        toast.error(`Archive failed: ${err instanceof Error ? err.message : "unknown"}`)
      )
    }
    toast.success(`Archived ${targets.length} agent${targets.length !== 1 ? "s" : ""}`)
  }

  return (
    <>
      <div ref={sidebarContainerRef} className="flex flex-col h-full bg-sidebar/80 backdrop-blur-xl w-full overflow-hidden">
        <TitleBar />

        {/* Home button */}
        <div className="px-2 pt-2 shrink-0">
          <button
            onClick={() => navigate({ to: "/" })}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              showHome
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <IconHome size={14} />
            Home
          </button>
        </div>

        {/* Tasks button (experimental) */}
        {tasksEnabled && (
          <div className="px-2 pt-1 shrink-0">
            <button
              onClick={() => navigate({ to: "/tasks" })}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                showTasks
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <IconLayoutKanban size={14} />
              Tasks
            </button>
          </div>
        )}

        {/* Tabs */}
        {(prReviewEnabled || refineEnabled) && (
          <div className="px-2 pt-2 pb-1.5 flex gap-1 shrink-0">
            <button
              onClick={() => { setTab("agents") }}
              className={cn(
                "flex-1 py-1 rounded-md text-[12px] font-medium transition-colors",
                tab === "agents"
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent/50"
              )}
            >
              Agents
            </button>
            {prReviewEnabled && (
              <button
                onClick={() => { setTab("review") }}
                className={cn(
                  "flex-1 py-1 rounded-md text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5",
                  tab === "review"
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent/50"
                )}
              >
                Review
                {unreadPrCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                    {unreadPrCount}
                  </span>
                )}
              </button>
            )}
            {refineEnabled && (
              <button
                onClick={() => setTab("refine")}
                className={cn(
                  "flex-1 py-1 rounded-md text-[12px] font-medium transition-colors flex items-center justify-center gap-1",
                  tab === "refine"
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <IconFlask size={11} />
                Refine
              </button>
            )}
          </div>
        )}

        {tab === "refine" && refineEnabled ? (
          <>
            {/* Refine header */}
            <div className="px-4 py-2.5 border-b border-sidebar-border shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Refinements</span>
                <Button variant="ghost" size="icon-xs" onClick={() => setShowNewRefine(true)} title="New refinement">
                  <IconPlus size={13} />
                </Button>
              </div>
            </div>

            {/* New refinement input */}
            {showNewRefine && (
              <div className="px-3 py-2 border-b border-sidebar-border shrink-0 flex gap-2 items-center">
                <IconTicket size={12} className="text-muted-foreground/40 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Ticket ID (e.g. ENG-123)"
                  value={newRefineInput}
                  onChange={(e) => setNewRefineInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newRefineInput.trim()) {
                      onNewRefine?.(newRefineInput.trim())
                      setNewRefineInput("")
                      setShowNewRefine(false)
                    }
                    if (e.key === "Escape") {
                      setNewRefineInput("")
                      setShowNewRefine(false)
                    }
                  }}
                  className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            )}

            {/* Refinement sessions list */}
            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-0.5">
                  {refineSessions.length === 0 ? (
                    <button
                      onClick={() => setShowNewRefine(true)}
                      className="w-full flex flex-col items-center gap-2 py-8 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                      <IconFlask size={20} />
                      <span className="text-[12px]">Start a new refinement</span>
                    </button>
                  ) : (
                    refineSessions.slice().reverse().map((session) => (
                      <button
                        key={session.id}
                        onClick={() => onSelectRefine?.(session.id)}
                        className={cn(
                          "w-full min-w-0 flex items-start gap-2 px-2.5 py-2 rounded-md text-left transition-all overflow-hidden",
                          selectedRefineId === session.id
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <IconTicket size={12} className="shrink-0 mt-0.5 text-muted-foreground/50" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono font-medium truncate block">{session.ticketId}</span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {session.agentId ? "In progress" : "Starting…"}
                          </span>
                        </div>
                        {session.agentId && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0 mt-1.5" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </>
        ) : (!prReviewEnabled || tab === "agents") ? (
          <>
            {/* Agents header */}
            <div className="px-4 py-2.5 border-b border-sidebar-border shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Workspaces</span>
                <div className="flex items-center gap-1">
                  <Button ref={filterBtnRef} variant="ghost" size="icon-xs" onClick={() => setShowFilter(!showFilter)}>
                    <IconFilter size={13} />
                  </Button>
                  <Button ref={addWorkspaceBtnRef} variant="ghost" size="icon-xs" onClick={() => setShowAddWorkspace(true)}>
                    <IconFolderPlus size={13} />
                  </Button>
                  <Button ref={newAgentBtnRef} variant="ghost" size="icon-xs" onClick={() => setShowNewAgent(true)}>
                    <IconPlus size={13} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Agent list */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <div className="p-2 pt-2.5 space-y-0.5">
                  {pendingAgent && (
                    <PendingAgentRow title={pendingAgent.title} repoName={pendingAgent.repoName} />
                  )}
                  {filteredAgents.length === 0 && !pendingAgent ? (
                    <button
                      onClick={() => setShowNewAgent(true)}
                      className="w-full flex flex-col items-center gap-2 py-8 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                      <IconSparkles size={20} />
                      <span className="text-[12px]">Create your first agent</span>
                    </button>
                  ) : groupBy === "status" ? (
                    visibleStatuses.map((status) => (
                      <StatusGroup
                        key={status}
                        status={status}
                        agents={grouped[status]}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        onHover={(agent, y) => setHoveredAgent({ agent, y })}
                        onLeave={() => setHoveredAgent(null)}
                        onDelete={handleDeleteAgent}
                        onArchiveAll={(status === "done" || status === "cancelled") ? () => handleArchiveAll(status) : undefined}
                        agentPorts={agentPorts}
                        repoNames={repoNames}
                        repoIcons={repoIcons}
                      />
                    ))
                  ) : (
                    repoGrouped.map((group) => (
                      <RepoGroup
                        key={group.id}
                        repoName={group.name}
                        agents={group.agents}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        onHover={(agent, y) => setHoveredAgent({ agent, y })}
                        onLeave={() => setHoveredAgent(null)}
                        onDelete={handleDeleteAgent}
                        agentPorts={agentPorts}
                      />
                    ))
                  )}
                </div>
            </div>
          </>
        ) : (
          <>
            {/* Review header */}
            <div className="px-4 py-2.5 border-b border-sidebar-border shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Pull Requests</span>
                <div className="flex items-center gap-0.5">
                  {isBulkReviewing ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={onCancelBulkReview}
                      title="Cancel bulk review"
                      className="text-destructive"
                    >
                      <IconPlayerStop size={13} />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={onBulkReview}
                      title={`Review all (${bulkReviewConcurrency} concurrent)`}
                    >
                      <IconPlayerPlay size={13} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onRefetchPRs}
                    title="Refresh"
                  >
                    <IconRefresh size={13} />
                  </Button>
                  <Button
                    ref={prFilterBtnRef}
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowPrFilter((v) => !v)}
                    className={hideReviewedPrs ? "text-primary" : ""}
                    title="Filter"
                  >
                    <IconFilter size={13} />
                  </Button>
                </div>
                {showPrFilter && (
                  <PRFilterPopover
                    hideReviewed={hideReviewedPrs}
                    onToggleHideReviewed={() => setHideReviewedPrs((v) => !v)}
                    onClose={() => setShowPrFilter(false)}
                    anchorRef={prFilterBtnRef}
                    concurrency={bulkReviewConcurrency}
                    onConcurrencyChange={onBulkReviewConcurrencyChange}
                  />
                )}
              </div>
              {isBulkReviewing && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <IconLoader2 size={11} className="animate-spin text-primary" />
                  <span className="text-[10px] text-muted-foreground/60">
                    Reviewing {bulkReviewingIds.size} PR{bulkReviewingIds.size !== 1 ? "s" : ""}...
                  </span>
                </div>
              )}
            </div>

            {/* PR list */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <PRList
                prsLoading={prsLoading}
                prs={prs}
                hideReviewedPrs={hideReviewedPrs}
                selectedPrId={selectedPrId}
                onSelectPr={onSelectPr}
                onHover={(pr, y) => setHoveredPr({ pr, y })}
                onLeave={() => setHoveredPr(null)}
                bulkReviewingIds={bulkReviewingIds}
              />
            </div>
          </>
        )}

        {/* Footer */}
        <div className="border-t border-sidebar-border shrink-0 flex items-center gap-1 pr-1">
          <div className="flex-1 min-w-0">
            <ServerSwitcher />
          </div>
          <Button
            ref={helpBtnRef}
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setShowHelp((v) => !v)}
            title="Help"
          >
            <IconQuestionMark size={13} />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onOpenSettings}>
            <IconSettings size={13} />
          </Button>
          {onToggle && (
            <Button variant="ghost" size="icon-xs" onClick={onToggle} title="Hide sidebar (⌘B)">
              <IconLayoutSidebarLeftCollapse size={13} />
            </Button>
          )}
        </div>
      </div>

      {hoveredAgent && sidebarContainerRef.current && (
        <AgentPopover
          agent={hoveredAgent.agent}
          y={hoveredAgent.y}
          port={agentPorts[hoveredAgent.agent.id]}
          sidebarWidth={sidebarContainerRef.current.getBoundingClientRect().width}
        />
      )}
      {hoveredPr && sidebarContainerRef.current && (
        <PRPopover
          pr={hoveredPr.pr}
          y={hoveredPr.y}
          sidebarWidth={sidebarContainerRef.current.getBoundingClientRect().width}
        />
      )}

      {showNewAgent && (
        <NewAgentPopover onClose={() => setShowNewAgent(false)} onSelect={handleCreateAgent} anchorRef={newAgentBtnRef} />
      )}
      {showAddWorkspace && (
        <AddWorkspacePopover
          onClose={() => setShowAddWorkspace(false)}
          onOpenProject={() => setShowAddRepo(true)}
          onClone={() => setShowCloneRepo(true)}
          onQuickStart={() => setShowQuickStart(true)}
          anchorRef={addWorkspaceBtnRef}
        />
      )}
      {showAddRepo && (
        <AddRepoDialog onClose={() => setShowAddRepo(false)} onAdded={() => setShowAddRepo(false)} />
      )}
      {showCloneRepo && (
        <CloneRepoDialog onClose={() => setShowCloneRepo(false)} onAdded={() => setShowCloneRepo(false)} />
      )}
      {showQuickStart && (
        <QuickStartDialog onClose={() => setShowQuickStart(false)} onAdded={() => setShowQuickStart(false)} />
      )}
      {showFeedback && (
        <FeedbackDialog onClose={() => setShowFeedback(false)} />
      )}
      {showHelp && (
        <HelpPopover
          feedbackEnabled={feedbackEnabled}
          onFeedback={() => setShowFeedback(true)}
          onClose={() => setShowHelp(false)}
          onShowShortcuts={() => setShowShortcuts(true)}
          anchorRef={helpBtnRef}
        />
      )}
      {showShortcuts && (
        <KeyboardShortcutsDialog onClose={() => setShowShortcuts(false)} />
      )}
      {showFilter && (
        <FilterPopover
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          repoFilter={repoFilter}
          onRepoFilterChange={setRepoFilter}
          repos={repos}
          onClose={() => setShowFilter(false)}
          anchorRef={filterBtnRef}
        />
      )}
    </>
  )
}
