import { useMemo } from "react"
import {
  api,
  queryKeys,
  useHuxfluxQuery,
  useRepos,
  type AgentSummary,
  type AgentStatus,
  type Repo,
} from "@huxflux/shared"
import { visibleStatuses } from "../agentListUtils"

interface UseAgentGroupsArgs {
  agents: AgentSummary[]
  repoFilter: string
}

interface AgentGroups {
  /** Top-level agents after repo filter; thread-children are split out below. */
  filteredAgents: AgentSummary[]
  /** Children indexed by `threadParentId` so each row can render its replies inline. */
  threadChildrenByParent: Map<string, AgentSummary[]>
  /**
   * Pinned agents render in their own section regardless of status, and are
   * excluded from `grouped` / `repoGrouped` so they don't double-render.
   */
  pinnedAgents: AgentSummary[]
  /** Agents grouped into `visibleStatuses` buckets, with pinned agents excluded. */
  grouped: Record<AgentStatus, AgentSummary[]>
  /** Agents grouped by repo id (pinned agents excluded), in iteration order of the filtered list. */
  repoGrouped: { id: string; name: string; agents: AgentSummary[] }[]
  /** repoId → repoName. */
  repoNames: Record<string, string>
  /** repoId → tabler icon name (may be undefined). */
  repoIcons: Record<string, string | undefined>
  /** repoId → repo type ("git" | "folder"). */
  repoTypes: Record<string, string | undefined>
  /** agentId → port for the agent's primary dev process (or undefined). */
  agentPorts: Record<string, number | null>
  /** Underlying repos array from the hook (passed through for places that need it). */
  repos: Repo[]
}

/**
 * One-stop derivation of every grouped/indexed shape the agent list needs.
 * Centralised here so the sidebar orchestrator and any future renderer
 * (e.g. a tasks board) share the same memoised computations.
 *
 * Repo filter is taken as an argument rather than read from localStorage so
 * the hook stays pure; the orchestrator owns the persisted state.
 */
export function useAgentGroups({ agents, repoFilter }: UseAgentGroupsArgs): AgentGroups {
  const { data: repos = [] } = useRepos()

  // Per-agent ports from the all-ports query (DB-backed, no polling)
  const { data: allPortsData = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.allPorts(),
    queryFn: () => api.agents.allPorts(),
    staleTime: 30_000,
  })

  const agentPorts = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const p of allPortsData) {
      if (!map[p.agentId]) map[p.agentId] = p.port
    }
    return map
  }, [allPortsData])

  // Separate thread children from top-level agents
  const threadChildrenByParent = useMemo(() => {
    const map = new Map<string, AgentSummary[]>()
    for (const a of agents) {
      if (a.threadParentId) {
        const list = map.get(a.threadParentId) ?? []
        list.push(a)
        map.set(a.threadParentId, list)
      }
    }
    return map
  }, [agents])

  const filteredAgents = useMemo(() => {
    const base = repoFilter === "all" ? agents : agents.filter((a) => a.repoId === repoFilter)
    return base.filter((a) => !a.threadParentId) // thread children render under their parent
  }, [agents, repoFilter])

  // Pinned agents render in their own section regardless of status, and are
  // excluded from the status/repo groupings below to avoid double-rendering.
  const pinnedAgents = useMemo(
    () => filteredAgents.filter((a) => a.pinned),
    [filteredAgents],
  )

  const grouped = useMemo(
    () => visibleStatuses.reduce<Record<string, AgentSummary[]>>(
      (acc, status) => {
        acc[status] = filteredAgents.filter((a) => a.status === status && !a.pinned)
        return acc
      },
      {}
    ) as Record<AgentStatus, AgentSummary[]>,
    [filteredAgents]
  )

  const repoNames = useMemo(
    () => Object.fromEntries(repos.map((r) => [r.id, r.name])),
    [repos]
  )

  const repoIcons = useMemo(
    () => Object.fromEntries(repos.map((r) => [r.id, r.icon ?? undefined])),
    [repos]
  )

  const repoTypes = useMemo(
    () => Object.fromEntries(repos.map((r) => [r.id, r.type])),
    [repos]
  )

  const repoGrouped = useMemo(() => {
    const map = new Map<string, { name: string; agents: AgentSummary[] }>()
    for (const agent of filteredAgents) {
      if (agent.pinned) continue // pinned agents render in the Pinned section
      const repoId = agent.repoId ?? "unknown"
      const repoName = repos.find((r) => r.id === repoId)?.name ?? agent.location ?? "Unknown"
      let entry = map.get(repoId)
      if (!entry) {
        entry = { name: repoName, agents: [] }
        map.set(repoId, entry)
      }
      entry.agents.push(agent)
    }
    return Array.from(map.entries()).map(([id, { name, agents: a }]) => ({ id, name, agents: a }))
  }, [filteredAgents, repos])

  return { filteredAgents, threadChildrenByParent, pinnedAgents, grouped, repoGrouped, repoNames, repoIcons, repoTypes, agentPorts, repos }
}
