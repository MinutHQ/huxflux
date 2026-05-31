import { useNavigate } from "@tanstack/react-router"
import type { Agent } from "@huxflux/shared"

interface AgentIdentityProps {
  agent: Agent
  repoName: string | undefined
}

/** Top line of the header: optional `repo /` prefix, agent title, optional `Task` link. */
export function AgentIdentity({ agent, repoName }: AgentIdentityProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-1 text-[13px] font-medium text-foreground truncate">
      {repoName && (
        <>
          <span className="text-muted-foreground/50">{repoName}</span>
          <span className="text-muted-foreground/30">/</span>
        </>
      )}
      <span className="truncate">{agent.title}</span>
      {agent.taskId && (
        <button
          onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: agent.taskId! } })}
          className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors ml-1 shrink-0"
          title="View task"
        >
          Task
        </button>
      )}
    </div>
  )
}
