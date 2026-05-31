import { cn } from "@huxflux/ui"
import {
  IconCheck,
  IconCircleX,
  IconExternalLink,
  IconLoader2,
} from "@tabler/icons-react"
import { useNavigate } from "@tanstack/react-router"
import type { TaskItem } from "@huxflux/shared"

function agentDotClass(status: TaskItem["agents"][number]["agentStatus"]) {
  return status === "done"
    ? "bg-emerald-500"
    : status === "in-review"
      ? "bg-blue-400"
      : status === "in-progress"
        ? "bg-amber-400"
        : "bg-muted-foreground/40"
}

/** Clickable list of linked agents that navigates into the agent route. */
export function TaskAgentLinks({ item }: { item: TaskItem }) {
  const navigate = useNavigate()
  if (item.agents.length === 0) return null
  return (
    <div className="space-y-1.5">
      <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Agents
      </h3>
      <div className="space-y-1">
        {item.agents.map((a) => (
          <button
            key={a.agentId}
            onClick={() =>
              navigate({ to: "/agent/$agentId", params: { agentId: a.agentId } })
            }
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/50 bg-card hover:border-foreground/20 transition-colors text-left"
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                agentDotClass(a.agentStatus),
              )}
            />
            <span className="text-[12px] text-foreground truncate flex-1">
              {a.agentTitle}
            </span>
            {a.prNumber && (
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                #{a.prNumber}
              </span>
            )}
            {a.ciStatus === "passing" && (
              <IconCheck size={11} className="text-emerald-400 shrink-0" />
            )}
            {a.ciStatus === "failing" && (
              <IconCircleX size={11} className="text-red-400 shrink-0" />
            )}
            {a.ciStatus === "pending" && (
              <IconLoader2
                size={10}
                className="text-muted-foreground/40 animate-spin shrink-0"
              />
            )}
            <IconExternalLink size={10} className="text-muted-foreground/30 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Detail card showing linked agents with their branch — read-only. */
export function TaskAgentDetails({ item }: { item: TaskItem }) {
  if (item.agents.length === 0) return null
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Agents
      </h3>
      <div className="space-y-1.5">
        {item.agents.map((agent) => (
          <div
            key={agent.agentId}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border"
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                agentDotClass(agent.agentStatus),
              )}
            />
            <span className="text-xs text-foreground font-medium">{agent.agentTitle}</span>
            <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto truncate max-w-[140px]">
              {agent.agentBranch}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
