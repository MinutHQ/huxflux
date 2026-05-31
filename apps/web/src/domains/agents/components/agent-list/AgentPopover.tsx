import React from "react"
import { createPortal } from "react-dom"
import * as TablerIcons from "@tabler/icons-react"
import {
  IconGitBranch,
  IconWorld,
  IconCheck,
  IconGitMerge,
  IconGitPullRequest,
} from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import { statusConfig, type AgentSummary } from "@huxflux/shared"
import { handleExternalClick } from "@/lib/platform"
import { StatusIcon } from "./StatusIcon"

interface AgentPopoverProps {
  agent: AgentSummary
  y: number
  port?: number | null
  /** Sidebar container — the popover pins to the right edge using its width. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Floating hover-card pinned to the right of the sidebar. Renders title, status,
 * branch path, port (if running), description, and the diff/PR summary. Read-only.
 */
export function AgentPopover({ agent, y, port, containerRef }: AgentPopoverProps) {
  const cfg = statusConfig[agent.status]
  // Reading the container rect during render is intentional — the container is
  // already mounted (we wouldn't be rendering without it) and the popover needs
  // the width to position itself.
  // eslint-disable-next-line react-hooks/refs
  const sidebarWidth = containerRef.current?.getBoundingClientRect().width ?? 0

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
        // Swapped zinc → muted/border/muted-foreground for the warm-taupe palette.
        agent.status === "backlog"     && "bg-muted/40 border-border text-muted-foreground",
        agent.status === "cancelled"   && "bg-red-500/10 border-red-500/25 text-red-400",
      )}>
        {cfg.label}
      </div>
    </div>,
    document.body
  )
}

