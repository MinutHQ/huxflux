import {
  IconBolt,
  IconDatabase,
  IconGitBranch,
  IconMessage,
} from "@tabler/icons-react"
import type { WorkspaceStats } from "@huxflux/shared"
import { useStagger } from "../../hooks/useStagger"
import { HeroCard, type HeroCardProps } from "./HeroCard"

interface HeroCardGridProps {
  stats: WorkspaceStats | null
  totalAgents: number
  repoCount: number
  sparkData: number[]
}

/**
 * The four large hero stat cards at the top of the dashboard (worktrees,
 * repos, messages, tool calls). Staggers each card's reveal 140ms apart and
 * passes the sparkline only to the worktrees card.
 */
export function HeroCardGrid({ stats, totalAgents, repoCount, sparkData }: HeroCardGridProps) {
  const heroVisible = useStagger(4, 140)

  const cards: Omit<HeroCardProps, "visible" | "sparkData">[] = [
    { icon: <IconGitBranch size={18} />, label: "Worktrees", value: stats?.agents.total ?? totalAgents, color: "rgb(96, 165, 250)", colorClass: "blue" },
    { icon: <IconDatabase size={18} />, label: "Repos", value: stats?.repos ?? repoCount, color: "rgb(167, 139, 250)", colorClass: "violet" },
    { icon: <IconMessage size={18} />, label: "Messages", value: stats?.messages.total ?? 0, color: "rgb(52, 211, 153)", colorClass: "emerald" },
    { icon: <IconBolt size={18} />, label: "Tool calls", value: stats?.toolCalls ?? 0, color: "rgb(251, 191, 36)", colorClass: "amber" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 mb-8">
      {cards.map((card, i) => (
        <HeroCard
          key={card.label}
          {...card}
          visible={heroVisible[i] ?? false}
          sparkData={i === 0 ? sparkData : undefined}
        />
      ))}
    </div>
  )
}
