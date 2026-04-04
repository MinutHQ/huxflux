import { useAgents, useRepos } from "@hive/shared"
import { statusConfig, type AgentStatus } from "@/data/mock"
import { cn } from "@hive/ui"
import {
  IconGitBranch,
  IconDatabase,
  IconSparkles,
  IconClock,
} from "@tabler/icons-react"

const visibleStatuses: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]

export function HomeView() {
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()

  const statusCounts = visibleStatuses.reduce<Record<string, number>>((acc, s) => {
    acc[s] = agents.filter((a) => a.status === s).length
    return acc
  }, {})

  const totalAgents = agents.length
  const repoCount = repos.length

  // Most recent agent
  const latestAgent = agents.length > 0
    ? [...agents].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : null

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Dashboard</h1>
        <p className="text-sm text-muted-foreground mb-8">Overview of your workspace</p>

        {/* Top-level stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard icon={<IconGitBranch size={18} />} label="Worktrees" value={totalAgents} />
          <StatCard icon={<IconDatabase size={18} />} label="Repos" value={repoCount} />
          <StatCard icon={<IconSparkles size={18} />} label="Active" value={statusCounts["in-progress"] ?? 0} />
        </div>

        {/* Status breakdown */}
        <div className="bg-card border border-border rounded-lg p-5 mb-8">
          <h2 className="text-sm font-medium text-foreground mb-4">Agents by status</h2>
          <div className="space-y-2.5">
            {visibleStatuses.map((status) => {
              const cfg = statusConfig[status]
              const count = statusCounts[status] ?? 0
              const pct = totalAgents > 0 ? (count / totalAgents) * 100 : 0
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-28 shrink-0">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotColor)} />
                    <span className={cn("text-[12px] font-medium", cfg.color)}>{cfg.label}</span>
                  </div>
                  <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", cfg.dotColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-muted-foreground w-8 text-right tabular-nums">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Repos list */}
        {repos.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-5 mb-8">
            <h2 className="text-sm font-medium text-foreground mb-4">Repositories</h2>
            <div className="space-y-2">
              {repos.map((repo) => {
                const agentCount = agents.filter((a) => a.repoId === repo.id).length
                return (
                  <div key={repo.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <IconDatabase size={14} className="text-muted-foreground/50" />
                      <span className="text-[13px] text-foreground">{repo.name}</span>
                    </div>
                    <span className="text-[12px] text-muted-foreground">{agentCount} agent{agentCount !== 1 ? "s" : ""}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Latest activity */}
        {latestAgent && (
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-foreground mb-3">Latest agent</h2>
            <div className="flex items-center gap-2 text-[13px]">
              <IconClock size={14} className="text-muted-foreground/50" />
              <span className="text-foreground">{latestAgent.title}</span>
              <span className="text-muted-foreground/50">-</span>
              <span className={cn("text-[12px]", statusConfig[latestAgent.status as AgentStatus]?.color ?? "text-muted-foreground")}>
                {statusConfig[latestAgent.status as AgentStatus]?.label ?? latestAgent.status}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
      <div className="text-muted-foreground/50">{icon}</div>
      <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </div>
  )
}
