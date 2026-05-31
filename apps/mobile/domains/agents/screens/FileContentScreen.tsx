import { View, Text, ScrollView, ActivityIndicator } from "react-native"
import { api, tokenize, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { FlashList } from "@shopify/flash-list"
import { c } from "@/theme"
import { TOKEN_COLOR } from "../components/DiffLineRow"

function LineRow({ lineNo, text }: { lineNo: number; text: string }) {
  const tokens = tokenize(text)
  return (
    <View style={{ flexDirection: "row", minHeight: 22 }}>
      <Text style={{ color: c.placeholder, fontSize: 10, fontFamily: "monospace", width: 40, textAlign: "right", paddingRight: 8, paddingTop: 3, flexShrink: 0, opacity: 0.7 }}>
        {lineNo}
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

export function FileContentScreen({ agentId, path }: { agentId: string; path: string }) {
  const { data: content, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileContent(agentId, path),
    queryFn: () => api.agents.fileContent(agentId, path),
    enabled: !!agentId && !!path,
    staleTime: 10_000,
  })

  const fileName = path.split("/").pop() ?? path
  const lines = content ? content.split("\n") : []

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.fg, fontSize: 13, fontFamily: "monospace", fontWeight: "600" }} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={{ color: c.fgSub, fontSize: 11, marginTop: 2 }}>{lines.length} lines</Text>
      </View>

      <FlashList
        data={lines}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => <LineRow lineNo={index + 1} text={item} />}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: c.fgSub, fontSize: 14 }}>Empty file</Text>
          </View>
        }
      />
    </View>
  )
}
