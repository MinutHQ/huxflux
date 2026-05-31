import { useAgents, useRepos } from "@huxflux/shared"
import { ActivityChart } from "./ActivityChart"
import { AnimatedSection } from "./AnimatedSection"
import { CodePanel } from "./CodePanel"
import { HeroCardGrid } from "./HeroCardGrid"
import { HomeBackground } from "./HomeBackground"
import { HomeHeader } from "./HomeHeader"
import { homeVisibleStatuses } from "./homeUtils"
import { RepoPanel } from "./RepoPanel"
import { StatusPanel } from "./StatusPanel"
import { TokenPanel } from "./TokenPanel"
import { useHomeStats } from "./useHomeStats"
import { WrappedPanel } from "./WrappedPanel"

/**
 * Lifetime workspace dashboard — the agent-centric landing view shown when
 * no specific agent is selected (and when transient setup/teardown routes
 * have nothing to render).
 *
 * Owns nothing but composition: derived counts come from `useAgents` +
 * `useRepos`, server stats from `useHomeStats`, and every panel is its own
 * presentational component under `home/`. The full-viewport background is
 * decorative (constellation + particles + aurora + blobs + mouse spotlight)
 * and lives in `HomeBackground`.
 */
export function HomeView() {
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const { stats, loaded, streak, sparkData, achievement } = useHomeStats()

  const statusCounts = homeVisibleStatuses.reduce<Record<string, number>>((acc, s) => {
    acc[s] = agents.filter((a) => a.status === s).length
    return acc
  }, {})

  return (
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden relative">
      <HomeBackground />

      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        <HomeHeader loaded={loaded} streak={streak} achievement={achievement} />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-start">
          <div className="min-w-0">
            <HeroCardGrid
              stats={stats}
              totalAgents={agents.length}
              repoCount={repos.length}
              sparkData={sparkData}
            />

            {stats && (
              <AnimatedSection delay={200}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                  <TokenPanel stats={stats} />
                  <CodePanel stats={stats} />
                </div>
              </AnimatedSection>
            )}

            {stats && stats.dailyAgents.length > 0 && (
              <AnimatedSection delay={350}>
                <div className="relative bg-card/80 backdrop-blur-xl border border-border rounded-xl p-5 mb-8 overflow-hidden group hover:border-border/80 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5">
                  <div className="relative flex items-center justify-between mb-4">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Agent activity (30 days)</h2>
                    <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                      {stats.dailyAgents.reduce((s, d) => s + d.count, 0)} total
                    </span>
                  </div>
                  <div className="relative">
                    <ActivityChart data={stats.dailyAgents} />
                  </div>
                </div>
              </AnimatedSection>
            )}

            <AnimatedSection delay={575}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatusPanel statusCounts={statusCounts} totalAgents={agents.length} />
                <RepoPanel repos={repos} agents={agents} />
              </div>
            </AnimatedSection>
          </div>

          <div className="min-w-0 lg:sticky lg:top-6">
            <AnimatedSection delay={425}>
              <WrappedPanel />
            </AnimatedSection>
          </div>
        </div>
      </div>
    </div>
  )
}
