import React, { useEffect, useRef, useState } from "react"
import * as TablerIcons from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import { useQueryClient } from "@tanstack/react-query"
import { api, type AgentSummary, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import { isPlaceholderTitle, modelColors, repoColor } from "../../agentListUtils"
import { StreamingDots } from "./StreamingDots"
import { PrIcon } from "./PrIcon"
import { StatusContextMenu } from "./StatusContextMenu"

interface AgentRowProps {
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
  repoType?: string
}

/**
 * One row in the sidebar agent list. Memoized so the list reorders without
 * re-rendering rows whose props haven't changed (status updates ripple through
 * the parent's `grouped` memo and only touch the moved row).
 *
 * - Click → select. Right-click → status/delete context menu. Double-click on
 *   the title → inline rename (commits on blur or Enter).
 * - Hover anywhere → fire `onHover` with the row's top for the AgentPopover.
 */
export const AgentRow = React.memo(function AgentRow({
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
  repoType,
}: AgentRowProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const avatarColor = repoName ? repoColor(repoName) : (modelColors[agent.model] ?? "bg-muted text-muted-foreground")
  const initials = (repoName ?? agent.title)[0].toUpperCase()
  const tablerIcons = TablerIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>
  const RepoIconComp = repoIcon ? tablerIcons[repoIcon] : undefined
  const isCancelled = agent.status === "cancelled"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

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

  const renameMutation = useHuxfluxMutation<unknown, string>({
    mutationFn: (title) => api.agents.update(agent.id, { title }),
    onSuccess: (_data, title) => {
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, title } : a) : old
      )
    },
  })

  function commitEdit() {
    const title = draft.trim()
    setEditing(false)
    if (!title || title === agent.title) return
    renameMutation.mutate(title)
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <>
      <button
        ref={ref}
        onClick={onClick}
        onContextMenu={handleContextMenu}
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
        <div className={cn("w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0", avatarColor)}>
          {RepoIconComp ? <RepoIconComp size={11} /> : initials}
        </div>
        {isStreaming ? <StreamingDots /> : <PrIcon agent={agent} repoType={repoType} />}
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
              !isSelected && !!agent.unread && "font-semibold text-foreground",
              isPlaceholderTitle(agent.title) && "italic text-muted-foreground/60",
            )}
            title={isPlaceholderTitle(agent.title) ? "Agent didn't rename itself — right-click to fix" : undefined}
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
