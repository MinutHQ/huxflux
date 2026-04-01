import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Pressable } from "react-native"
import { useRouter } from "expo-router"
import { useAgents, statusOrder, type AgentSummary, type AgentStatus, getActiveServer } from "@hive/shared"
import { c, statusColors } from "../../theme"
import { useState } from "react"

function AgentRow({ agent }: { agent: AgentSummary }) {
  const router = useRouter()
  const dotColor = statusColors[agent.status]?.color ?? c.fgSub

  return (
    <TouchableOpacity
      onPress={() => router.push(`/agent/${agent.id}`)}
      style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor, flexShrink: 0 }} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500", flex: 1 }} numberOfLines={1}>
            {agent.title}
          </Text>
          {!!agent.unread && (
            <View style={{ backgroundColor: c.fgBright, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: c.fgBrightFg, fontSize: 10, fontWeight: "700" }}>{agent.unread}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
          <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace" }} numberOfLines={1}>
            {agent.branch}
          </Text>
          {agent.prStatus && (
            <Text style={{ color: c.fgSub, fontSize: 11 }}>· PR #{agent.prStatus.number}</Text>
          )}
        </View>
      </View>

      <Text style={{ color: c.fgSub, fontSize: 11 }}>›</Text>
    </TouchableOpacity>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {title}
      </Text>
      <Text style={{ color: c.placeholder, fontSize: 11 }}>{count}</Text>
    </View>
  )
}

export default function AgentsScreen() {
  const router = useRouter()
  const { data: agents = [], isLoading, refetch } = useAgents()
  const [refreshing, setRefreshing] = useState(false)
  const server = getActiveServer()

  async function onRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  type ListItem =
    | { kind: "header"; status: AgentStatus }
    | { kind: "agent"; agent: AgentSummary }

  const items: ListItem[] = []
  for (const status of statusOrder) {
    const group = agents.filter((a) => a.status === status)
    if (group.length === 0) continue
    items.push({ kind: "header", status })
    for (const agent of group) items.push({ kind: "agent", agent })
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
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
          style={{ backgroundColor: c.fgBright, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
        >
          <Text style={{ color: c.fgBrightFg, fontWeight: "600", fontSize: 14 }}>Add Server</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const STATUS_LABEL: Record<AgentStatus, string> = {
    "in-progress": "In progress",
    "in-review": "In review",
    backlog: "Backlog",
    done: "Done",
    cancelled: "Cancelled",
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View>
          <Text style={{ color: c.fg, fontSize: 20, fontWeight: "700" }}>Agents</Text>
          <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 1 }}>{server.name}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => router.push("/servers")}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: c.fgSub, fontSize: 16 }}>⊕</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/new-agent")}
            style={{ paddingHorizontal: 14, height: 34, borderRadius: 8, backgroundColor: c.fgBright, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: c.fgBrightFg, fontSize: 13, fontWeight: "600" }}>+ New</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.kind === "header" ? `h-${item.status}` : item.agent.id}
        renderItem={({ item }) => {
          if (item.kind === "header") {
            const count = agents.filter((a) => a.status === item.status).length
            return <SectionHeader title={STATUS_LABEL[item.status]} count={count} />
          }
          return <AgentRow agent={item.agent} />
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.link} />}
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
