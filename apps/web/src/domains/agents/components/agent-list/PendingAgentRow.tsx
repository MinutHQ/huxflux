import { cn } from "@huxflux/ui"
import { repoColor } from "../../agentListUtils"

/**
 * Shimmer row shown above the in-progress group while a worktree is being set
 * up. The agent does not yet exist server-side; once `createAgent` returns the
 * pending row is replaced by a real `AgentRow`.
 */
export function PendingAgentRow({ title, repoName }: { title: string; repoName: string }) {
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
