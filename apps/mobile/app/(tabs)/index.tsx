import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Pressable, Alert, ActionSheetIOS, Platform } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgents, useRepos, useServerStatus, statusOrder, statusConfig, api, type AgentSummary, type AgentStatus, getActiveServer } from "@hive/shared"
import { c, statusColors } from "../../theme"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

const STATUS_OPTIONS: AgentStatus[] = ["in-progress", "in-review", "done", "backlog", "cancelled"]

function AgentRow({ agent }: { agent: AgentSummary }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const dotColor = statusColors[agent.status]?.color ?? c.fgSub

  function handleLongPress() {
    const options = ["Rename", "Change status", "Delete", "Cancel"]
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 2, title: agent.title },
        (idx) => {
          if (idx === 0) promptRename()
          if (idx === 1) promptStatus()
          if (idx === 2) promptDelete()
        }
      )
    } else {
      Alert.alert(agent.title, undefined, [
        { text: "Rename", onPress: promptRename },
        { text: "Change status", onPress: promptStatus },
        { text: "Delete", style: "destructive", onPress: promptDelete },
        { text: "Cancel", style: "cancel" },
      ])
    }
  }

  function promptRename() {
    Alert.prompt("Rename agent", undefined, (newTitle) => {
      if (!newTitle?.trim() || newTitle.trim() === agent.title) return
      api.updateAgent(agent.id, { title: newTitle.trim() })
      queryClient.setQueryData<AgentSummary[]>(["agents"], (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, title: newTitle.trim() } : a) : old
      )
    }, "plain-text", agent.title)
  }

  function promptStatus() {
    const labels = STATUS_OPTIONS.map((s) => statusConfig[s].label)
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, "Cancel"], cancelButtonIndex: labels.length, title: "Change status" },
        (idx) => {
          if (idx < STATUS_OPTIONS.length) applyStatus(STATUS_OPTIONS[idx])
        }
      )
    } else {
      Alert.alert("Change status", undefined, [
        ...STATUS_OPTIONS.map((s) => ({ text: statusConfig[s].label, onPress: () => applyStatus(s) })),
        { text: "Cancel", style: "cancel" },
      ])
    }
  }

  function applyStatus(s: AgentStatus) {
    api.updateAgent(agent.id, { status: s })
    queryClient.setQueryData<AgentSummary[]>(["agents"], (old) =>
      old ? old.map((a) => a.id === agent.id ? { ...a, status: s } : a) : old
    )
  }

  function promptDelete() {
    Alert.alert("Delete agent", `Delete "${agent.title}"? This cannot be undone.`, [
      { text: "Delete", style: "destructive", onPress: () => {
        api.deleteAgent(agent.id)
        queryClient.setQueryData<AgentSummary[]>(["agents"], (old) =>
          old ? old.filter((a) => a.id !== agent.id) : old
        )
      }},
      { text: "Cancel", style: "cancel" },
    ])
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
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor, flexShrink: 0 }} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500", flex: 1 }} numberOfLines={1}>
            {agent.title}
          </Text>
          {!!agent.unread && (
            <View style={{ backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{agent.unread}</Text>
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
              {agent.prStatus.merged ? " ✓" : agent.prStatus.state === "closed" ? " ✕" : agent.prStatus.hasChangeRequests ? " ⚠" : ""}
            </Text>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={14} color={c.fgSub} />
    </TouchableOpacity>
  )
}

function SectionHeader({ title, count, collapsed, onToggle }: { title: string; count: number; collapsed: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{ paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <Ionicons
        name={collapsed ? "chevron-forward" : "chevron-down"}
        size={12}
        color={c.placeholder}
      />
      <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {title}
      </Text>
      <Text style={{ color: c.placeholder, fontSize: 11, marginLeft: "auto" }}>{count}</Text>
    </Pressable>
  )
}

export default function AgentsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data: agents = [], isLoading, refetch } = useAgents()
  const { data: repos = [] } = useRepos()
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<AgentStatus>>(new Set(["done", "cancelled"]))
  const [repoFilter, setRepoFilter] = useState<string>("all")
  const server = getActiveServer()
  const serverStatuses = useServerStatus(server ? [server] : [])
  const serverStatus = server ? (serverStatuses[server.id] ?? "checking") : null
  const isUnauthorized = serverStatus === "unauthorized"

  async function onRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  function toggleCollapsed(status: AgentStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  function showRepoFilter() {
    const options = ["All repos", ...repos.map((r) => r.name), "Cancel"]
    const cancelIdx = options.length - 1
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIdx, title: "Filter by repo" },
        (idx) => {
          if (idx === 0) setRepoFilter("all")
          else if (idx < cancelIdx) setRepoFilter(repos[idx - 1].id)
        }
      )
    } else {
      Alert.alert("Filter by repo", undefined, [
        { text: "All repos", onPress: () => setRepoFilter("all") },
        ...repos.map((r) => ({ text: r.name, onPress: () => setRepoFilter(r.id) })),
        { text: "Cancel", style: "cancel" as const },
      ])
    }
  }

  const filteredAgents = repoFilter === "all" ? agents : agents.filter((a) => a.repoId === repoFilter)
  const activeRepoName = repoFilter !== "all" ? repos.find((r) => r.id === repoFilter)?.name : null

  type ListItem =
    | { kind: "header"; status: AgentStatus; count: number }
    | { kind: "agent"; agent: AgentSummary }

  const items: ListItem[] = []
  for (const status of statusOrder) {
    const group = filteredAgents.filter((a) => a.status === status)
    // Always show all status groups (even empty), like web
    items.push({ kind: "header", status, count: group.length })
    if (!collapsed.has(status)) {
      for (const agent of group) items.push({ kind: "agent", agent })
    }
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  if (!server) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>No server connected</Text>
        <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center", marginBottom: 24 }}>Add a Hive server to get started</Text>
        <TouchableOpacity
          onPress={() => router.push("/servers")}
          style={{ backgroundColor: c.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Add Server</Text>
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
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <View style={{ gap: 3 }}>
          <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", letterSpacing: -0.4 }}>Hive</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isUnauthorized ? c.warning : serverStatus === "offline" ? c.error : c.success }} />
            <Text style={{ color: isUnauthorized ? c.warning : c.fgSub, fontSize: 12 }}>{server.name}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* Add repo */}
          <Pressable
            onPress={() => router.push("/add-repo")}
            style={{ width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="folder-open-outline" size={16} color={c.fgSub} />
          </Pressable>
          {/* Filter */}
          <Pressable
            onPress={showRepoFilter}
            style={{
              height: 34, borderRadius: 8, borderWidth: 1,
              borderColor: repoFilter !== "all" ? c.accent : c.border,
              backgroundColor: repoFilter !== "all" ? `${c.accent}22` : "transparent",
              alignItems: "center", justifyContent: "center",
              flexDirection: "row", gap: 4, paddingHorizontal: 10,
            }}
          >
            <Ionicons name="filter-outline" size={14} color={repoFilter !== "all" ? c.accent : c.fgSub} />
            {activeRepoName && (
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: "500" }} numberOfLines={1}>
                {activeRepoName}
              </Text>
            )}
          </Pressable>
          {/* New agent */}
          <Pressable
            onPress={() => router.push("/new-agent")}
            style={{ paddingHorizontal: 13, height: 34, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}
          >
            <Ionicons name="add" size={17} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>New</Text>
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

      <FlatList
        data={items}
        keyExtractor={(item) => item.kind === "header" ? `h-${item.status}` : item.agent.id}
        renderItem={({ item }) => {
          if (item.kind === "header") {
            return (
              <SectionHeader
                title={statusConfig[item.status].label}
                count={item.count}
                collapsed={collapsed.has(item.status)}
                onToggle={() => toggleCollapsed(item.status)}
              />
            )
          }
          return <AgentRow agent={item.agent} />
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  )
}
