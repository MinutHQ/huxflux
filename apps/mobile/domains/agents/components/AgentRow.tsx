import { View, Text, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { api, statusConfig, getActiveServer, queryKeys, type AgentSummary, type AgentStatus } from "@huxflux/shared"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { StreamingDots } from "./StreamingDots"

const STATUS_OPTIONS: AgentStatus[] = ["in-progress", "draft-pr", "in-review", "done", "backlog", "cancelled"]

export function AgentRow({ agent, isStreaming, repoName }: {
  agent: AgentSummary
  isStreaming: boolean
  repoName?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const modal = useModal()
  const agentsKey = queryKeys.agents.list(getActiveServer()?.url ?? null)

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
      api.agents.update(agent.id, { title: newTitle })
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
    api.agents.update(agent.id, { status: s })
    queryClient.setQueryData<AgentSummary[]>(agentsKey, (old) =>
      old ? old.map((a) => a.id === agent.id ? { ...a, status: s } : a) : old
    )
  }

  function promptDelete() {
    modal.showConfirm("Delete agent", `Delete "${agent.title}"? This cannot be undone.`, "Delete", () => {
      api.agents.delete(agent.id)
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

  function handlePress() {
    if (agent.unread) {
      const prev = queryClient.getQueryData<AgentSummary[]>(agentsKey)
      queryClient.setQueryData<AgentSummary[]>(agentsKey, (old) =>
        old ? old.map((a) => a.id === agent.id ? { ...a, unread: 0 } : a) : old
      )
      api.agents.update(agent.id, { unread: 0 }).catch(() => {
        if (prev) queryClient.setQueryData(agentsKey, prev)
      })
    }
    router.push(`/agent/${agent.id}`)
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      {isStreaming && (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#f59e0b", flexShrink: 0 }} />
      )}

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
          {repoName && (
            <Text style={{ color: c.fgSub, fontSize: 12 }} numberOfLines={1}>
              {repoName}
            </Text>
          )}
          {agent.prStatus && (
            <Text style={{ color: prColor ?? c.fgSub, fontSize: 11 }}>
              PR #{agent.prStatus.number}
              {agent.prStatus.merged ? " ✓" : agent.prStatus.state === "closed" ? " ✕" : agent.prStatus.hasChangeRequests ? " !" : ""}
            </Text>
          )}
        </View>
      </View>

      {isStreaming ? <StreamingDots /> : <Ionicons name="chevron-forward" size={14} color={c.fgSub} />}
    </TouchableOpacity>
  )
}
