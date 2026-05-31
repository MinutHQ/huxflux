import { useEffect, useMemo, useState } from "react"
import { IconRocket, IconSparkles, IconTrophy } from "@tabler/icons-react"
import { api, type WorkspaceStats } from "@huxflux/shared"

interface Achievement {
  icon: React.ReactNode
  text: string
}

interface HomeStats {
  stats: WorkspaceStats | null
  loaded: boolean
  streak: number
  sparkData: number[]
  achievement: Achievement | null
}

/**
 * Fetches `api.agents.stats()` once on mount, derives the consecutive-days streak,
 * the 14-day sparkline buckets, and the highest-tier achievement badge to
 * show in the header.
 */
export function useHomeStats(): HomeStats {
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.agents.stats()
      .then((s) => { setStats(s); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const streak = useMemo(() => {
    if (!stats?.dailyAgents.length) return 0
    const lookup = new Set(stats.dailyAgents.map((d) => d.date))
    let count = 0
    const d = new Date()
    while (lookup.has(d.toISOString().slice(0, 10))) {
      count++
      d.setDate(d.getDate() - 1)
    }
    return count
  }, [stats])

  const sparkData = useMemo(() => {
    if (!stats?.dailyAgents.length) return []
    const lookup = new Map(stats.dailyAgents.map((d) => [d.date, d.count]))
    const days: number[] = []
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      days.push(lookup.get(d.toISOString().slice(0, 10)) ?? 0)
    }
    return days
  }, [stats])

  const achievement = useMemo<Achievement | null>(() => {
    const t = stats?.toolCalls ?? 0
    const m = stats?.messages.total ?? 0
    if (t > 10000) return { icon: <IconTrophy size={14} />, text: "10k tool calls!" }
    if (m > 1000) return { icon: <IconRocket size={14} />, text: "1k messages!" }
    if (t > 1000) return { icon: <IconSparkles size={14} />, text: "1k tool calls!" }
    if (m > 100) return { icon: <IconRocket size={14} />, text: "100+ messages" }
    return null
  }, [stats])

  return { stats, loaded, streak, sparkData, achievement }
}
