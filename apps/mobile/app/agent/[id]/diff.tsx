import { View, Text, ScrollView, ActivityIndicator } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { api, parseUnifiedDiff, tokenize, type DiffLine } from "@hive/shared"
import { FlashList } from "@shopify/flash-list"

// Token class → color mapping for React Native
const TOKEN_COLOR: Record<string, string> = {
  comment: "#71717a",
  string: "#fbbf24",
  template: "#7dd3fc",
  keyword: "#a78bfa",
  type: "#7dd3fc",
  constructor: "#2dd4bf",
  number: "#fb923c",
  punctuation: "#71717a",
  identifier: "#e4e4e7",
  whitespace: "transparent",
  other: "#a1a1aa",
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const isAdd = line.type === "add"
  const isDel = line.type === "del"
  const isHunk = line.type === "hunk"

  if (isHunk) {
    return (
      <View style={{ backgroundColor: "#0c1a2e", paddingHorizontal: 12, paddingVertical: 3 }}>
        <Text style={{ color: "#60a5fa", fontSize: 11, fontFamily: "monospace", opacity: 0.7 }}>{line.text}</Text>
      </View>
    )
  }

  const bgColor = isAdd ? "rgba(16,185,129,0.08)" : isDel ? "rgba(239,68,68,0.08)" : "transparent"
  const signColor = isAdd ? "#10b981" : isDel ? "#f87171" : "transparent"
  const sign = isAdd ? "+" : isDel ? "−" : " "
  const tokens = tokenize(line.text)

  return (
    <View style={{ flexDirection: "row", backgroundColor: bgColor, minHeight: 22 }}>
      {/* Line number */}
      <Text style={{ color: isAdd ? "#34d399" : isDel ? "#f87171" : "#3f3f46", fontSize: 10, fontFamily: "monospace", width: 36, textAlign: "right", paddingRight: 6, paddingTop: 3, flexShrink: 0, opacity: 0.7 }}>
        {line.lineNo ?? ""}
      </Text>
      {/* Sign */}
      <Text style={{ color: signColor, fontSize: 12, fontFamily: "monospace", width: 14, paddingTop: 3, flexShrink: 0 }}>
        {sign}
      </Text>
      {/* Code */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 20, paddingTop: 2, paddingRight: 16 }}>
          {tokens.map((tok, i) => (
            <Text key={i} style={{ color: TOKEN_COLOR[tok.cls] ?? "#e4e4e7" }}>{tok.text}</Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  )
}

export default function DiffScreen() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>()

  const { data: rawDiff, isLoading } = useQuery({
    queryKey: ["diff", id, path],
    queryFn: () => api.getDiff(id!, path!),
    enabled: !!id && !!path,
    staleTime: 10_000,
  })

  const fileName = (path ?? "").split("/").pop() ?? path ?? ""
  const lines = rawDiff ? parseUnifiedDiff(rawDiff) : []
  const addCount = lines.filter((l) => l.type === "add").length
  const delCount = lines.filter((l) => l.type === "del").length

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#60a5fa" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      {/* File header */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1f1f1f", flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: "#fafafa", fontSize: 13, fontFamily: "monospace", fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={{ color: "#10b981", fontSize: 12, fontWeight: "600" }}>+{addCount}</Text>
        <Text style={{ color: "#f87171", fontSize: 12, fontWeight: "600" }}>-{delCount}</Text>
      </View>

      <FlashList
        data={lines}
        estimatedItemSize={22}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <DiffLineRow line={item} />}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: "#71717a", fontSize: 14 }}>No diff available</Text>
          </View>
        }
      />
    </View>
  )
}
