import { useRepos, type Agent } from "@huxflux/shared"
import { cn } from "@huxflux/ui"
import { isTauri } from "@/lib/platform"
import { AgentIdentity } from "./header/AgentIdentity"
import { BranchRow } from "./header/BranchRow"
import { HeaderActions } from "./header/HeaderActions"

interface AgentWorkspaceHeaderProps {
  agent: Agent
  isStreaming: boolean
  githubEnabled: boolean
  onCreatePR?: () => void
  onReview?: () => void
  onRun?: () => void
  rightPanelVisible?: boolean
  onToggleRightPanel?: () => void
  sidebarCollapsed?: boolean
}

/**
 * Top bar above the per-agent chat. Three regions:
 *  - left identity (repo / title / task link)
 *  - branch line (current branch + base branch, both pickable)
 *  - right action cluster (PR badges, create PR / review / run, open-in, panel toggle)
 */
export function AgentWorkspaceHeader({
  agent,
  isStreaming,
  githubEnabled,
  onCreatePR,
  onReview,
  onRun,
  rightPanelVisible = true,
  onToggleRightPanel,
  sidebarCollapsed,
}: AgentWorkspaceHeaderProps) {
  const { data: repos = [] } = useRepos()
  const repo = repos.find((r) => r.id === agent.repoId)

  return (
    <div
      className={cn("flex items-center gap-3 px-4 py-1.5 shrink-0", isTauri && "min-h-10", sidebarCollapsed && isTauri && "pl-32")}
      onMouseDown={isTauri ? (e) => {
        if ((e.target as HTMLElement).closest("button, a, input, [role='dialog'], [data-slot='select-trigger']")) return
        if (e.detail === 2) {
          import("@tauri-apps/api/core").then(({ invoke }) => invoke("zoom_window"))
        } else {
          import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
        }
      } : undefined}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <AgentIdentity agent={agent} repoName={repo?.name} />
        <BranchRow agent={agent} repo={repo} />
      </div>

      <HeaderActions
        agent={agent}
        repo={repo}
        isStreaming={isStreaming}
        githubEnabled={githubEnabled}
        rightPanelVisible={rightPanelVisible}
        onCreatePR={onCreatePR}
        onReview={onReview}
        onRun={onRun}
        onToggleRightPanel={onToggleRightPanel}
      />
    </div>
  )
}
