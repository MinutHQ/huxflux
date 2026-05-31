import { View, FlatList, RefreshControl } from "react-native"
import { useRouter, useFocusEffect } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgents, useRepos, useServerStatus, useWsConnected, statusConfig, api, markAgentDeleted, type AgentSummary, type AgentStatus, getActiveServer, getServers, setActiveServerId, queryKeys } from "@huxflux/shared"
import { c } from "@/theme"
import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useHydrated } from "@/lib/hydration"
import { useModal } from "@/ui"
import { AgentRow } from "../components/AgentRow"
import { StatusSectionHeader, RepoSectionHeader } from "../components/AgentSectionHeaders"
import { AgentListHeader } from "../components/AgentListHeader"
import { CenteredSpinner, NoServerState } from "../components/AgentListStates"
import { UnauthorizedBanner, DisconnectedBanner, GroupByToggle } from "../components/AgentListBanner"
import { useAgentListPrefs } from "../hooks/useAgentListPrefs"

// Match the desktop sidebar order
const SIDEBAR_STATUS_ORDER: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]

type ListItem =
  | { kind: "status-header"; status: AgentStatus; count: number }
  | { kind: "repo-header"; repoId: string; name: string; count: number }
  | { kind: "agent"; agent: AgentSummary }

function buildListItems(
  groupBy: "status" | "repo",
  filteredAgents: AgentSummary[],
  collapsed: Set<string>,
  repos: { id: string; name: string }[],
): ListItem[] {
  const list: ListItem[] = []
  if (groupBy === "status") {
    for (const status of SIDEBAR_STATUS_ORDER) {
      const group = filteredAgents.filter((a) => a.status === status)
      list.push({ kind: "status-header", status, count: group.length })
      if (!collapsed.has(status)) {
        for (const agent of group) list.push({ kind: "agent", agent })
      }
    }
  } else {
    const repoMap = new Map<string, { name: string; agents: AgentSummary[] }>()
    for (const agent of filteredAgents) {
      const rid = agent.repoId ?? "_none"
      if (!repoMap.has(rid)) {
        const repo = repos.find((r) => r.id === rid)
        repoMap.set(rid, { name: repo?.name ?? "Unknown", agents: [] })
      }
      repoMap.get(rid)!.agents.push(agent)
    }
    const sorted = [...repoMap.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
    for (const [rid, { name, agents: repoAgents }] of sorted) {
      list.push({ kind: "repo-header", repoId: rid, name, count: repoAgents.length })
      if (!collapsed.has(`repo-${rid}`)) {
        for (const agent of repoAgents) list.push({ kind: "agent", agent })
      }
    }
  }
  return list
}

export function AgentListScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const hydrated = useHydrated()
  const modal = useModal()
  const { data: agents = [], isLoading, refetch } = useAgents()
  const { data: repos = [] } = useRepos()
  const repoNames = useMemo(() => Object.fromEntries(repos.map((r) => [r.id, r.name])), [repos])
  const [refreshing, setRefreshing] = useState(false)
  const { collapsed, repoFilter, groupBy, setRepoFilter, setGroupBy, toggleCollapsed } = useAgentListPrefs(hydrated)

  const server = getActiveServer()
  const allServers = getServers()
  const serverStatuses = useServerStatus(server ? [server] : [])
  const serverStatus = server ? (serverStatuses[server.id] ?? "checking") : null
  const isUnauthorized = serverStatus === "unauthorized"
  const wsConnected = useWsConnected()
  const [wsWasConnected, setWsWasConnected] = useState(false)
  // Sync external (WS) connection state once it goes true so we can later
  // detect a disconnect. This is a sync-once pattern, not a derived value.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (wsConnected) setWsWasConnected(true) }, [wsConnected])
  const isDisconnected = wsWasConnected && !wsConnected

  const isFirstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (isFirstFocus.current) { isFirstFocus.current = false; return }
    refetch()
  }, [refetch]))

  function showServerSwitcher() {
    if (allServers.length <= 1) {
      router.push("/servers")
      return
    }
    const options = allServers
      .filter((s) => s.id !== server?.id)
      .map((s) => ({
        label: s.name,
        onPress: () => { setActiveServerId(s.id) },
      }))
    options.push({ label: "Manage servers…", onPress: () => router.push("/servers") })
    modal.showActionSheet("Switch server", options)
  }

  async function onRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const filteredAgents = repoFilter === "all" ? agents : agents.filter((a) => a.repoId === repoFilter)
  const activeRepoName = repoFilter !== "all" ? repos.find((r) => r.id === repoFilter)?.name ?? null : null

  function handleArchiveAll(status: AgentStatus) {
    const targets = filteredAgents.filter((a) => a.status === status)
    if (targets.length === 0) return
    modal.showConfirm(
      "Archive all",
      `Archive ${targets.length} ${statusConfig[status].label.toLowerCase()} agent${targets.length !== 1 ? "s" : ""}?`,
      "Archive",
      () => {
        const ids = targets.map((a) => a.id)
        for (const id of ids) markAgentDeleted(id)
        queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
          old ? old.filter((a) => !ids.includes(a.id)) : old
        )
        for (const id of ids) api.agents.delete(id)
      },
      true
    )
  }

  function showRepoFilter() {
    modal.showActionSheet("Filter by repo", [
      { label: "All repos", onPress: () => setRepoFilter("all") },
      ...repos.map((r) => ({ label: r.name, onPress: () => setRepoFilter(r.id) })),
    ])
  }

  const items = useMemo(
    () => buildListItems(groupBy, filteredAgents, collapsed, repos),
    [groupBy, filteredAgents, collapsed, repos],
  )

  if (!hydrated || isLoading) return <CenteredSpinner />
  if (!server) return <NoServerState />

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AgentListHeader
        insetsTop={insets.top}
        serverName={server.name}
        isUnauthorized={isUnauthorized}
        serverStatusOffline={serverStatus === "offline"}
        isDisconnected={isDisconnected}
        repoFilter={repoFilter}
        activeRepoName={activeRepoName}
        onShowServerSwitcher={showServerSwitcher}
        onShowRepoFilter={showRepoFilter}
      />

      {isUnauthorized && <UnauthorizedBanner />}
      {isDisconnected && !isUnauthorized && <DisconnectedBanner />}

      <GroupByToggle groupBy={groupBy} onSelect={setGroupBy} />

      <FlatList
        data={items}
        keyExtractor={(item) => {
          if (item.kind === "status-header") return `sh-${item.status}`
          if (item.kind === "repo-header") return `rh-${item.repoId}`
          return item.agent.id
        }}
        renderItem={({ item }) => {
          if (item.kind === "status-header") {
            return (
              <StatusSectionHeader
                status={item.status}
                count={item.count}
                collapsed={collapsed.has(item.status)}
                onToggle={() => toggleCollapsed(item.status)}
                onArchiveAll={(item.status === "done" || item.status === "cancelled") ? () => handleArchiveAll(item.status) : undefined}
              />
            )
          }
          if (item.kind === "repo-header") {
            return (
              <RepoSectionHeader
                name={item.name}
                count={item.count}
                collapsed={collapsed.has(`repo-${item.repoId}`)}
                onToggle={() => toggleCollapsed(`repo-${item.repoId}`)}
              />
            )
          }
          return <AgentRow agent={item.agent} isStreaming={!!item.agent.streaming} repoName={item.agent.repoId ? repoNames[item.agent.repoId] : undefined} />
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.fgSub} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  )
}
