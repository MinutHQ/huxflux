import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, parseUnifiedDiff, type FileChange, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { c } from "@/theme"
import { DiffLineRow } from "../DiffLineRow"

export function InlineFileDiff({ file, agentId, expanded, onToggle }: {
  file: FileChange
  agentId: string
  expanded: boolean
  onToggle: () => void
}) {
  const name = file.path.split("/").pop() ?? file.path
  const dir  = file.path.slice(0, file.path.length - name.length - 1)

  const { data: rawDiff, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.agents.diff(agentId, file.path),
    queryFn: () => api.agents.diff(agentId, file.path),
    enabled: expanded,
    staleTime: 10_000,
  })

  const lines = rawDiff ? parseUnifiedDiff(rawDiff) : []

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
      {/* File header */}
      <TouchableOpacity
        onPress={onToggle}
        style={{
          paddingHorizontal: 14, paddingVertical: 10,
          flexDirection: "row", alignItems: "center", gap: 10,
          backgroundColor: c.card,
        }}
      >
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={13}
          color={c.fgSub}
          style={{ flexShrink: 0 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          {dir ? (
            <Text style={{ color: c.fgSub, fontSize: 10, fontFamily: "monospace" }} numberOfLines={1}>
              {dir}/
            </Text>
          ) : null}
          <Text style={{ color: c.fg, fontSize: 12, fontFamily: "monospace", fontWeight: "600" }} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {file.additions > 0 && (
            <Text style={{ color: c.success, fontSize: 11, fontWeight: "600" }}>+{file.additions}</Text>
          )}
          {file.deletions > 0 && (
            <Text style={{ color: c.error, fontSize: 11, fontWeight: "600" }}>-{file.deletions}</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Diff lines */}
      {expanded && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
          {isLoading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={c.link} size="small" />
            </View>
          ) : lines.length === 0 ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 12 }}>No diff available</Text>
            </View>
          ) : (
            lines.map((line, i) => <DiffLineRow key={i} line={line} />)
          )}
        </View>
      )}
    </View>
  )
}
