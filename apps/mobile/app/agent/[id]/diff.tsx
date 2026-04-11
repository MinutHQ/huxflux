import { View, Text, ActivityIndicator } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { api, parseUnifiedDiff } from "@huxflux/shared"
import { FlashList } from "@shopify/flash-list"
import { c } from "../../../theme"
import { DiffLineRow } from "../../../components/DiffLineRow"

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
