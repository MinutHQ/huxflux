import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Pressable, Animated, Easing } from "react-native"
import { useRouter, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgents, useRepos, useServerStatus, useWsConnected, statusConfig, api, type AgentSummary, type AgentStatus, type Repo, getActiveServer, getServers, setActiveServerId } from "@huxflux/shared"
import { c, statusColors } from "../../theme"
import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useHydrated } from "../_layout"
import { useModal } from "../../components/Modal"

// Match the desktop sidebar order
const SIDEBAR_STATUS_ORDER: AgentStatus[] = ["done", "in-review", "in-progress", "backlog", "cancelled"]
const STATUS_OPTIONS: AgentStatus[] = ["in-progress", "in-review", "done", "backlog", "cancelled"]

// ── Streaming dots indicator ─────────────────────────────────────────────────

function StreamingDots() {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current

  useEffect(() => {
    const animations = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(a, { toValue: 1, duration: 400, delay: i * 150, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(a, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    )
    Animated.parallel(animations).start()
    return () => anims.forEach((a) => a.stopAnimation())
  }, [])

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: "#f59e0b",
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          }}
        />
      ))}
    </View>
  )
}

// ── Agent row ────────────────────────────────────────────────────────────────

function AgentRow({ agent, isStreaming }: { agent: AgentSummary; isStreaming: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const modal = useModal()
  const agentsKey = ["agents", getActiveServer()?.url ?? null]
  const dotColor = statusColors[agent.status]?.color ?? c.fgSub

  function handleLongPress() {
    modal.showActionSheet(agent.title, [
      { label: "Rename", onPress: promptRename },
      { label: "Change status", onPress: promptStatus },
      { label: "Delete", onPress: promptDelete, destructive: true },
    ])
  }

  function promptRename() {
    modal.showPrompt("Rename agent", agent.title, (newTitle) => {
      if (newTitle === agent.title) return
      api.updateAgent(agent.id, { title: newTitle })
      queryClient.setQueryData<AgentSummary[]>(agentsKey, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, title: newTitle } : a) : old
      )
    })
  }

  function promptStatus() {
    modal.showActionSheet("Change status", STATUS_OPTIONS.map((s) => ({
      label: statusConfig[s].label,
      onPress: () => applyStatus(s),
    })))
  }

  function applyStatus(s: AgentStatus) {
    api.updateAgent(agent.id, { status: s })
    queryClient.setQueryData<AgentSummary[]>(agentsKey, (old) =>
      old ? old.map((a) => a.id === agent.id ? { ...a, status: s } : a) : old
    )
  }

  function promptDelete() {
    modal.showConfirm("Delete agent", `Delete "${agent.title}"? This cannot be undone.`, "Delete", () => {
      api.deleteAgent(agent.id)
      queryClient.setQueryData<AgentSummary[]>(agentsKey, (old) =>
        old ? old.filter((a) => a.id !== agent.id) : old
      )
    }, true)
  }

  const prColor = agent.prStatus
    ? agent.prStatus.merged ? "#34d399"
    : agent.prStatus.state === "closed" ? "#f87171"
    : agent.prStatus.hasChangeRequests ? "#f59e0b"
    : agent.prStatus.draft ? c.fgSub
    : "#60a5fa"
    : null

  return (
    <TouchableOpacity
      onPress={() => router.push(`/agent/${agent.id}`)}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isStreaming ? "#f59e0b" : dotColor, flexShrink: 0 }} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500", flex: 1 }} numberOfLines={1}>
            {agent.title}
          </Text>
          {!!agent.unread && (
            <View style={{ backgroundColor: c.secondary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: c.fg, fontSize: 10, fontWeight: "700" }}>{agent.unread}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
          <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace" }} numberOfLines={1}>
            {agent.branch}
          </Text>
          {agent.prStatus && (
            <Text style={{ color: prColor ?? c.fgSub, fontSize: 11 }}>
              · PR #{agent.prStatus.number}
              {agent.prStatus.merged ? " ✓" : agent.prStatus.state === "closed" ? " ✕" : agent.prStatus.hasChangeRequests ? " !" : ""}
            </Text>
          )}
        </View>
      </View>

      {isStreaming ? <StreamingDots /> : <Ionicons name="chevron-forward" size={14} color={c.fgSub} />}
    </TouchableOpacity>
  )
}

// ── Section headers ──────────────────────────────────────────────────────────

function StatusSectionHeader({ status, count, collapsed, onToggle }: { status: AgentStatus; count: number; collapsed: boolean; onToggle: () => void }) {
  const sc = statusColors[status]
  const color = sc?.color ?? c.fgSub
  return (
    <Pressable
      onPress={onToggle}
      style={{ paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={12} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {statusConfig[status].label}
      </Text>
      <Text style={{ color: c.placeholder, fontSize: 11, marginLeft: "auto" }}>{count}</Text>
    </Pressable>
  )
}

function RepoSectionHeader({ name, count, collapsed, onToggle }: { name: string; count: number; collapsed: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{ paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={12} color={c.fgSub} />
      <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="code-slash-outline" size={12} color={c.fgSub} />
      </View>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "600", flex: 1 }}>{name}</Text>
      <Text style={{ color: c.placeholder, fontSize: 11 }}>{count}</Text>
    </Pressable>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

type GroupBy = "status" | "repo"

export default function AgentsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const hydrated = useHydrated()
  const modal = useModal()
  const { data: agents = [], isLoading, refetch } = useAgents()
  const { data: repos = [] } = useRepos()
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["done", "cancelled"]))
  const [repoFilter, setRepoFilter] = useState<string>("all")
  const [groupBy, setGroupBy] = useState<GroupBy>("status")
  const server = getActiveServer()
  const allServers = getServers()
  const serverStatuses = useServerStatus(server ? [server] : [])
  const serverStatus = server ? (serverStatuses[server.id] ?? "checking") : null
  const isUnauthorized = serverStatus === "unauthorized"
  const wsConnected = useWsConnected()
  const [wsWasConnected, setWsWasConnected] = useState(false)
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

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function showRepoFilter() {
    modal.showActionSheet("Filter by repo", [
      { label: "All repos", onPress: () => setRepoFilter("all") },
      ...repos.map((r) => ({ label: r.name, onPress: () => setRepoFilter(r.id) })),
    ])
  }

  const filteredAgents = repoFilter === "all" ? agents : agents.filter((a) => a.repoId === repoFilter)
  const activeRepoName = repoFilter !== "all" ? repos.find((r) => r.id === repoFilter)?.name : null

  type ListItem =
    | { kind: "status-header"; status: AgentStatus; count: number }
    | { kind: "repo-header"; repoId: string; name: string; count: number }
    | { kind: "agent"; agent: AgentSummary }

  const items = useMemo(() => {
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
  }, [groupBy, filteredAgents, collapsed, repos])

  // Show loader until hydration is complete
  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.fgSub} />
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.fgSub} />
      </View>
    )
  }

  if (!server) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>No server connected</Text>
        <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center", marginBottom: 24 }}>Add a Huxflux server to get started</Text>
        <TouchableOpacity
          onPress={() => router.push("/servers")}
          style={{ backgroundColor: c.fgBright, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
        >
          <Text style={{ color: c.fgBrightFg, fontWeight: "600", fontSize: 14 }}>Add Server</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 10,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: c.card,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        gap: 10,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={showServerSwitcher} style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isUnauthorized ? c.warning : (serverStatus === "offline" || isDisconnected) ? c.error : c.success }} />
            <Text style={{ color: isUnauthorized ? c.warning : c.fg, fontSize: 17, fontWeight: "700", letterSpacing: -0.4, flex: 1 }} numberOfLines={1}>
              {server.name}
            </Text>
            <Ionicons name="chevron-down" size={14} color={c.fgSub} style={{ marginLeft: -2 }} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/new-agent")}
            style={{ paddingHorizontal: 13, height: 34, borderRadius: 8, backgroundColor: c.fgBright, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, marginLeft: 12 }}
          >
            <Ionicons name="add" size={17} color={c.fgBrightFg} />
            <Text style={{ color: c.fgBrightFg, fontSize: 13, fontWeight: "600" }}>New</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => router.push("/add-repo")}
            style={{ width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="folder-open-outline" size={16} color={c.fgSub} />
          </Pressable>
          <Pressable
            onPress={showRepoFilter}
            style={{
              height: 34, borderRadius: 8, borderWidth: 1,
              borderColor: repoFilter !== "all" ? c.fg : c.border,
              backgroundColor: repoFilter !== "all" ? c.secondary : "transparent",
              alignItems: "center", justifyContent: "center",
              flexDirection: "row", gap: 4, paddingHorizontal: 10,
            }}
          >
            <Ionicons name="filter-outline" size={14} color={repoFilter !== "all" ? c.fg : c.fgSub} />
            {activeRepoName && (
              <Text style={{ color: c.fg, fontSize: 12, fontWeight: "500" }} numberOfLines={1}>
                {activeRepoName}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {isUnauthorized && (
        <Pressable
          onPress={() => router.push("/servers")}
          style={{ backgroundColor: "rgba(251,191,36,0.12)", borderBottomWidth: 1, borderBottomColor: "rgba(251,191,36,0.25)", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Ionicons name="warning-outline" size={15} color={c.warning} />
          <Text style={{ color: c.warning, fontSize: 12, flex: 1 }}>Authentication failed — tap to update token</Text>
          <Ionicons name="chevron-forward" size={13} color={c.warning} />
        </Pressable>
      )}

      {isDisconnected && !isUnauthorized && (
        <View style={{ backgroundColor: "rgba(239,68,68,0.12)", borderBottomWidth: 1, borderBottomColor: "rgba(239,68,68,0.25)", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="wifi-outline" size={15} color={c.error} />
          <Text style={{ color: c.error, fontSize: 12, flex: 1 }}>Disconnected — reconnecting…</Text>
        </View>
      )}

      {/* Group-by toggle */}
      <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingVertical: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {(["status", "repo"] as const).map((g) => (
          <Pressable
            key={g}
            onPress={() => setGroupBy(g)}
            style={{
              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6,
              backgroundColor: groupBy === g ? c.secondary : "transparent",
            }}
          >
            <Text style={{ color: groupBy === g ? c.fg : c.fgSub, fontSize: 12, fontWeight: groupBy === g ? "600" : "400" }}>
              {g === "status" ? "By Status" : "By Repo"}
            </Text>
          </Pressable>
        ))}
      </View>

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
          return <AgentRow agent={item.agent} isStreaming={!!item.agent.streaming} />
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.fgSub} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  )
}
