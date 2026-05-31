import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys, type Agent, type AgentSummary } from "@huxflux/shared"
import { c } from "@/theme"

export function SessionsStrip({
  rootId,
  rootTitle,
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  creatingSession,
}: {
  rootId: string
  rootTitle: string | undefined
  sessions: AgentSummary[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  creatingSession: boolean
}) {
  const queryClient = useQueryClient()

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center" }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 4, paddingVertical: 6, flexDirection: "row" }}>
        {/* Root session tab */}
        <TouchableOpacity
          onPress={() => onSelect(rootId)}
          style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
            backgroundColor: activeSessionId === rootId ? c.secondary : "transparent",
          }}
        >
          <Text style={{ color: activeSessionId === rootId ? c.fg : c.fgSub, fontSize: 12, fontWeight: "500" }}>
            {rootTitle ?? "Session 1"}
          </Text>
        </TouchableOpacity>
        {/* Child session tabs */}
        {sessions.map((s, i) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => {
              // Pre-fill cache if not already there
              queryClient.setQueryData(queryKeys.agents.detail(s.id), (old: Agent | undefined) =>
                old ?? { ...s, messages: [], fileChanges: [], terminalOutput: [] }
              )
              onSelect(s.id)
            }}
            style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
              backgroundColor: activeSessionId === s.id ? c.secondary : "transparent",
            }}
          >
            <Text style={{ color: activeSessionId === s.id ? c.fg : c.fgSub, fontSize: 12, fontWeight: "500" }}>
              {s.title === "Untitled" ? `Session ${i + 2}` : s.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* New session button */}
      <TouchableOpacity
        onPress={onCreate}
        disabled={creatingSession}
        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
      >
        {creatingSession
          ? <ActivityIndicator size="small" color={c.fgSub} />
          : <Text style={{ color: c.fgSub, fontSize: 18, lineHeight: 20 }}>+</Text>
        }
      </TouchableOpacity>
    </View>
  )
}
