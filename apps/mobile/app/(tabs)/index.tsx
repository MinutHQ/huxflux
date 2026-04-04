import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Pressable, Alert } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgents, useServerStatus, statusOrder, statusConfig, api, type AgentSummary, type AgentStatus, getActiveServer } from "@hive/shared"
import { c, statusColors } from "../../theme"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

const STATUS_OPTIONS: AgentStatus[] = ["in-progress", "in-review", "done", "backlog", "cancelled"]

function AgentRow({ agent }: { agent: AgentSummary }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const dotColor = statusColors[agent.status]?.color ?? c.fgSub

  function handleLongPress() {
    const renameOption = "Rename"
    const statusOption = "Change status"
    const deleteOption = "Delete"
    const cancelOption = "Cancel"
    Alert.alert(agent.title, undefined, [
      {
        text: renameOption,
        onPress: () => {
          Alert.prompt("Rename agent", undefined, (newTitle) => {
            if (!newTitle?.trim() || newTitle.trim() === agent.title) return
            api.updateAgent(agent.id, { title: newTitle.trim() })
            queryClient.setQueryData<AgentSummary[]>(["agents"], (old) =>
              old ? old.map((a) => a.id === agent.id ? { ...a, title: newTitle.trim() } : a) : old
            )
          }, "plain-text", agent.title)
        },
      },
      {
        text: statusOption,
        onPress: () => {
          Alert.alert("Change status", undefined, [
            ...STATUS_OPTIONS.map((s) => ({
              text: statusConfig[s].label,
              onPress: () => {
                api.updateAgent(agent.id, { status: s })
                queryClient.setQueryData<AgentSummary[]>(["agents"], (old) =>
                  old ? old.map((a) => a.id === agent.id ? { ...a, status: s } : a) : old
                )
              },
            })),
            { text: cancelOption, style: "cancel" as const },
          ])
        },
      },
      { text: deleteOption, style: "destructive" as const, onPress: () => {
        Alert.alert("Delete agent", `Delete "${agent.title}"?`, [
          { text: "Delete", style: "destructive", onPress: () => {
            api.deleteAgent(agent.id)
            queryClient.setQueryData<AgentSummary[]>(["agents"], (old) =>
              old ? old.filter((a) => a.id !== agent.id) : old
            )
          }},
          { text: "Cancel", style: "cancel" },
        ])
      }},
      { text: cancelOption, style: "cancel" },
    ])
  }

  // PR state color
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
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<AgentStatus>>(new Set(["done", "cancelled"]))
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

  type ListItem =
    | { kind: "header"; status: AgentStatus; count: number }
    | { kind: "agent"; agent: AgentSummary }

  const items: ListItem[] = []
  for (const status of statusOrder) {
    const group = agents.filter((a) => a.status === status)
    if (group.length === 0) continue
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
      {/* Header — clears Dynamic Island / status bar */}
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
        <Pressable
          onPress={() => router.push("/new-agent")}
          style={{ paddingHorizontal: 13, height: 34, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}
        >
          <Ionicons name="add" size={17} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>New</Text>
        </Pressable>
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
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: c.fgSub, fontSize: 14 }}>No agents yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  )
}
