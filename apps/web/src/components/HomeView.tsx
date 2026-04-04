import { useEffect, useState } from "react"
import { api, useAgents, useRepos, type WorkspaceStats } from "@hive/shared"
import { statusConfig, type AgentStatus } from "@/data/mock"
import { cn } from "@hive/ui"
import {
  IconGitBranch,
  IconDatabase,
  IconSparkles,
  IconMessage,
  IconBolt,
  IconCode,
  IconPlus,
  IconMinus,
} from "@tabler/icons-react"

const visibleStatuses: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export function HomeView() {
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const [stats, setStats] = useState<WorkspaceStats | null>(null)

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {})
  }, [])

  const statusCounts = visibleStatuses.reduce<Record<string, number>>((acc, s) => {
    acc[s] = agents.filter((a) => a.status === s).length
    return acc
  }, {})

  const totalAgents = agents.length

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground/60 mt-1">Lifetime workspace stats</p>
        </div>

        {/* Hero stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <HeroCard
            icon={<IconGitBranch size={16} />}
            label="Worktrees"
            value={stats?.agents.total ?? totalAgents}
            accent="text-blue-400"
            bg="bg-blue-500/10"
          />
          <HeroCard
            icon={<IconDatabase size={16} />}
            label="Repos"
            value={stats?.repos ?? repos.length}
            accent="text-violet-400"
            bg="bg-violet-500/10"
          />
          <HeroCard
            icon={<IconMessage size={16} />}
            label="Messages"
            value={stats?.messages.total ?? 0}
            accent="text-emerald-400"
            bg="bg-emerald-500/10"
          />
          <HeroCard
            icon={<IconBolt size={16} />}
            label="Tool calls"
            value={stats?.toolCalls ?? 0}
            accent="text-amber-400"
            bg="bg-amber-500/10"
          />
        </div>

        {/* Token usage + Code changes row */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Token usage</h2>
              <div className="grid grid-cols-2 gap-4">
                <TokenStat label="Input" value={stats.messages.inputTokens} />
                <TokenStat label="Output" value={stats.messages.outputTokens} />
                <TokenStat label="Cache read" value={stats.messages.cacheReadTokens} />
                <TokenStat label="Cache write" value={stats.messages.cacheWriteTokens} />
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Code changes</h2>
              <div className="flex items-end gap-6 mb-4">
                <div>
                  <div className="text-2xl font-bold text-foreground tabular-nums">{formatNum(stats.fileChanges.total)}</div>
                  <div className="text-[11px] text-muted-foreground/50">files changed</div>
                </div>
                <div className="flex items-center gap-3 text-[13px] pb-1">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <IconPlus size={12} />
                    {formatNum(stats.fileChanges.additions)}
                  </span>
                  <span className="flex items-center gap-1 text-red-400">
                    <IconMinus size={12} />
                    {formatNum(stats.fileChanges.deletions)}
                  </span>
                </div>
              </div>
              {stats.fileChanges.additions + stats.fileChanges.deletions > 0 && (
                <div className="h-2 rounded-full overflow-hidden flex bg-muted/30">
                  <div
                    className="bg-emerald-500/70 h-full"
                    style={{ width: `${(stats.fileChanges.additions / (stats.fileChanges.additions + stats.fileChanges.deletions)) * 100}%` }}
                  />
                  <div className="bg-red-500/70 h-full flex-1" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity chart */}
        {stats && stats.dailyAgents.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 mb-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Agent activity (30 days)</h2>
            <ActivityChart data={stats.dailyAgents} />
          </div>
        )}

        {/* Status + Repos side by side */}
        <div className="grid grid-cols-2 gap-3">
          {/* Status breakdown */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">By status</h2>
            <div className="space-y-3">
              {visibleStatuses.map((status) => {
                const cfg = statusConfig[status]
                const count = statusCounts[status] ?? 0
                const pct = totalAgents > 0 ? (count / totalAgents) * 100 : 0
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-24 shrink-0">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotColor)} />
                      <span className={cn("text-[12px] font-medium", cfg.color)}>{cfg.label}</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", cfg.dotColor)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-muted-foreground/60 w-6 text-right tabular-nums">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Repos */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">Repositories</h2>
            {repos.length > 0 ? (
              <div className="space-y-2.5">
                {repos.map((repo) => {
                  const agentCount = agents.filter((a) => a.repoId === repo.id).length
                  return (
                    <div key={repo.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                          <IconCode size={14} className="text-violet-400" />
                        </div>
                        <span className="text-[13px] text-foreground font-medium">{repo.name}</span>
                      </div>
                      <span className="text-[12px] text-muted-foreground/50 tabular-nums">{agentCount}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground/40">No repos configured</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroCard({ icon, label, value, accent, bg }: {
  icon: React.ReactNode
  label: string
  value: number
  accent: string
  bg: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", bg, accent)}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground tabular-nums tracking-tight">{formatNum(value)}</div>
        <div className="text-[11px] text-muted-foreground/50 font-medium mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-foreground tabular-nums">{formatNum(value)}</div>
      <div className="text-[11px] text-muted-foreground/50">{label}</div>
    </div>
  )
}

function ActivityChart({ data }: { data: { date: string; count: number }[] }) {
  // Fill in missing days for last 30 days
  const days: { date: string; count: number }[] = []
  const lookup = new Map(data.map((d) => [d.date, d.count]))
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, count: lookup.get(key) ?? 0 })
  }
  const max = Math.max(...days.map((d) => d.count), 1)

  return (
    <div className="flex items-end gap-[3px] h-16">
      {days.map((d) => {
        const h = d.count > 0 ? Math.max((d.count / max) * 100, 8) : 0
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className={cn(
              "flex-1 rounded-sm transition-all",
              d.count > 0 ? "bg-blue-500/60 hover:bg-blue-400/80" : "bg-muted/20"
            )}
            style={{ height: d.count > 0 ? `${h}%` : "4px" }}
          />
        )
      })}
    </div>
  )
}
