import { View, Text, TouchableOpacity, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useState } from "react"
import { c } from "@/theme"
import type { TeamAgent } from "../agents.types"
import { MessageContent } from "./MessageContent"

function TeamAgentDetail({ agent, onClose }: { agent: TeamAgent; onClose: () => void }) {
  const output = agent.outputText || agent.result || ""
  return (
    <View style={{ maxHeight: 260, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.fg, fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>{agent.description}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={16} color={c.fgSub} />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        {agent.subCalls && agent.subCalls.length > 0 && (
          <View style={{ marginBottom: 8, gap: 2 }}>
            {agent.subCalls.map((sc) => (
              <View key={sc.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}>
                <Text style={{ color: sc.result != null ? "#34d399" : "#f59e0b", fontSize: 9 }}>
                  {sc.result != null ? "✓" : "○"}
                </Text>
                <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace" }} numberOfLines={1}>
                  {sc.tool}
                </Text>
              </View>
            ))}
          </View>
        )}
        {output ? (
          <MessageContent text={output} />
        ) : (
          <Text style={{ color: c.fgSub, fontSize: 12, fontStyle: "italic" }}>No output yet</Text>
        )}
      </ScrollView>
    </View>
  )
}

export function TeamBar({ agents }: { agents: TeamAgent[]; isStreaming?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const runningCount = agents.filter((a) => a.status === "running").length
  const doneCount = agents.filter((a) => a.status === "done").length
  const selected = agents.find((a) => a.id === selectedId) ?? null

  if (dismissed || agents.length === 0) return null

  return (
    <View>
      {/* Detail panel */}
      {selected && <TeamAgentDetail agent={selected} onClose={() => setSelectedId(null)} />}

      {/* Bar */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 4, flexDirection: "row", alignItems: "center" }}
        >
          {/* Team label */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6 }}>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600" }}>Team</Text>
            <Text style={{ color: c.placeholder, fontSize: 10, fontFamily: "monospace" }}>
              {runningCount > 0 ? `${runningCount} running` : ""}{runningCount > 0 && doneCount > 0 ? ", " : ""}{doneCount > 0 ? `${doneCount} done` : ""}
            </Text>
          </View>

          {/* Agent tabs */}
          {agents.map((a) => {
            const isSelected = selectedId === a.id
            const isDone = a.status === "done"
            return (
              <TouchableOpacity
                key={a.id}
                onPress={() => setSelectedId(isSelected ? null : a.id)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 5,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                  backgroundColor: isSelected ? c.secondary : "transparent",
                  borderWidth: 1, borderColor: isSelected ? c.border : "transparent",
                }}
              >
                <Text style={{ color: isDone ? "#34d399" : "#f59e0b", fontSize: 9 }}>{isDone ? "✓" : "●"}</Text>
                <Text style={{ color: isSelected ? c.fg : c.fgSub, fontSize: 11, fontWeight: "500" }} numberOfLines={1}>
                  {a.description}
                </Text>
              </TouchableOpacity>
            )
          })}

          {/* Dismiss */}
          <TouchableOpacity onPress={() => setDismissed(true)} style={{ paddingHorizontal: 6 }}>
            <Ionicons name="close" size={14} color={c.placeholder} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  )
}
