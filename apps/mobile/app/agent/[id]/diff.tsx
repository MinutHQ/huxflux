import { View, Text, ScrollView, ActivityIndicator } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { api, parseUnifiedDiff, tokenize, type DiffLine } from "@hive/shared"
import { FlashList } from "@shopify/flash-list"
import { c } from "../../../theme"

// Syntax token class → color (warm palette where applicable)
const TOKEN_COLOR: Record<string, string> = {
  comment:     c.fgSub,
  string:      c.warning,    // amber
  template:    "#7dd3fc",    // sky-300 (syntax highlight, intentional)
  keyword:     "#a78bfa",    // violet-400 (syntax highlight, intentional)
  type:        "#7dd3fc",
  constructor: "#2dd4bf",    // teal-400 (syntax highlight, intentional)
  number:      "#fb923c",    // orange-400 (syntax highlight, intentional)
  punctuation: c.fgSub,
  identifier:  c.fgBright,
  whitespace:  "transparent",
  other:       c.fgSub,
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const isAdd  = line.type === "add"
  const isDel  = line.type === "del"
  const isHunk = line.type === "hunk"

  if (isHunk) {
    return (
      <View style={{ backgroundColor: c.card, paddingHorizontal: 12, paddingVertical: 3 }}>
        <Text style={{ color: c.link, fontSize: 11, fontFamily: "monospace", opacity: 0.7 }}>{line.text}</Text>
      </View>
    )
  }

  const bgColor   = isAdd ? c.addBg : isDel ? c.delBg : "transparent"
  const signColor = isAdd ? c.success : isDel ? c.error : "transparent"
  const sign      = isAdd ? "+" : isDel ? "−" : " "
  const tokens    = tokenize(line.text)

  return (
    <View style={{ flexDirection: "row", backgroundColor: bgColor, minHeight: 22 }}>
      <Text style={{ color: isAdd ? c.success : isDel ? c.error : c.placeholder, fontSize: 10, fontFamily: "monospace", width: 36, textAlign: "right", paddingRight: 6, paddingTop: 3, flexShrink: 0, opacity: 0.7 }}>
        {line.lineNo ?? ""}
      </Text>
      <Text style={{ color: signColor, fontSize: 12, fontFamily: "monospace", width: 14, paddingTop: 3, flexShrink: 0 }}>
        {sign}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 20, paddingTop: 2, paddingRight: 16 }}>
          {tokens.map((tok, i) => (
            <Text key={i} style={{ color: TOKEN_COLOR[tok.cls] ?? c.fgBright }}>{tok.text}</Text>
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
  const lines    = rawDiff ? parseUnifiedDiff(rawDiff) : []
  const addCount = lines.filter((l) => l.type === "add").length
  const delCount = lines.filter((l) => l.type === "del").length

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: c.fg, fontSize: 13, fontFamily: "monospace", fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={{ color: c.success, fontSize: 12, fontWeight: "600" }}>+{addCount}</Text>
        <Text style={{ color: c.error, fontSize: 12, fontWeight: "600" }}>-{delCount}</Text>
      </View>

      <FlashList
        data={lines}
        estimatedItemSize={22}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <DiffLineRow line={item} />}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: c.fgSub, fontSize: 14 }}>No diff available</Text>
          </View>
        }
      />
    </View>
  )
}
