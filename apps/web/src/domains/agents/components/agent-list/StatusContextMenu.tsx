import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  IconCheck,
  IconSparkles,
  IconGitBranch,
  IconPin,
  IconPinnedOff,
  IconTrash,
} from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, statusConfig, useRepos, type AgentSummary, type AgentStatus, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import { StatusIcon } from "./StatusIcon"
import { isPlaceholderTitle, visibleStatuses } from "../../agentListUtils"

interface StatusContextMenuProps {
  x: number
  y: number
  agent: AgentSummary
  onClose: () => void
  onDelete: (agent: AgentSummary) => void
}

/**
 * Right-click menu on an agent row. Owns set-status, generate-title (with optional
 * branch rename), rename-branch prompt, and a two-step confirm-delete flow.
 * Updates the local TanStack cache optimistically; the server's WS event reconciles.
 *
 * Folder agents have no git branch — the "Rename branch" item is omitted and
 * the "Generate title" item never offers to rename a branch alongside the title.
 */
export function StatusContextMenu({ x, y, agent, onClose, onDelete }: StatusContextMenuProps) {
  const queryClient = useQueryClient()
  const { data: repos = [] } = useRepos()
  const agentRepo = repos.find((r) => r.id === agent.repoId)
  const isFolderAgent = agentRepo?.type === "folder" || agent.branch === "local"
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
    // Position calculation runs once on mount; the x/y arguments are the
    // initial click coordinates and never change while the menu is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setStatusMut = useHuxfluxMutation<unknown, AgentStatus>({
    mutationFn: (status) => api.agents.update(agent.id, { status }),
    onSuccess: (_data, status) => {
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, status } : a) : old
      )
    },
  })

  const togglePinMut = useHuxfluxMutation<unknown, boolean>({
    mutationFn: (pinned) => api.agents.update(agent.id, { pinned }),
    onSuccess: (_data, pinned) => {
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, pinned } : a) : old
      )
    },
  })

  const generateTitleMut = useHuxfluxMutation<AgentSummary, { renameBranch?: boolean }>({
    mutationFn: (opts) => api.agents.generateTitle(agent.id, opts.renameBranch ? { branch: true } : undefined),
    onSuccess: (updated) => {
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, title: updated.title, branch: updated.branch, location: updated.location } : a) : old
      )
    },
    onError: () => toast.error("Failed to generate title"),
  })

  const renameBranchMut = useHuxfluxMutation<AgentSummary, string>({
    mutationFn: (next) => api.agents.renameBranch(agent.id, next),
    onSuccess: (updated) => {
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, branch: updated.branch, location: updated.location } : a) : old
      )
    },
    onError: (err) => toast.error(`Rename failed: ${(err as Error).message}`),
  })

  function handleSetStatus(status: AgentStatus) {
    onClose()
    if (status === agent.status) return
    setStatusMut.mutate(status)
  }

  function handleTogglePin() {
    onClose()
    togglePinMut.mutate(!agent.pinned)
  }

  function handleGenerateTitle(opts: { renameBranch?: boolean } = {}) {
    onClose()
    generateTitleMut.mutate(opts)
  }

  function handleRenameBranch() {
    onClose()
    const next = window.prompt("New branch name (kebab-case, no prefix):", agent.branch ?? "")
    if (!next || !next.trim()) return
    renameBranchMut.mutate(next.trim())
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
          onClick={handleTogglePin}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/60 transition-colors"
        >
          {agent.pinned
            ? <IconPinnedOff size={13} className="text-muted-foreground/60 shrink-0" />
            : <IconPin size={13} className="text-muted-foreground/60 shrink-0" />}
          <span className="flex-1 text-left">{agent.pinned ? "Unpin" : "Pin"}</span>
        </button>
        <div className="border-t border-border my-1" />
        <button
          onClick={() => handleGenerateTitle({ renameBranch: !isFolderAgent && isPlaceholderTitle(agent.title) })}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/60 transition-colors"
        >
          <IconSparkles size={13} className="text-muted-foreground/60 shrink-0" />
          <span className="flex-1 text-left">
            {!isFolderAgent && isPlaceholderTitle(agent.title) ? "Generate name + branch" : "Generate title"}
          </span>
        </button>
        {!isFolderAgent && (
          <button
            onClick={handleRenameBranch}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/60 transition-colors"
          >
            <IconGitBranch size={13} className="text-muted-foreground/60 shrink-0" />
            <span className="flex-1 text-left">Rename branch…</span>
          </button>
        )}
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
