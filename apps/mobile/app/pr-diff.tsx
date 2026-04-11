import { View, Text, ActivityIndicator, Pressable } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { parseUnifiedDiff } from "@huxflux/shared"
import { FlashList } from "@shopify/flash-list"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { c } from "../theme"
import { DiffLineRow } from "../components/DiffLineRow"

export default function PRDiffScreen() {
  const { path, patch } = useLocalSearchParams<{ path: string; patch: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const fileName = (path ?? "").split("/").pop() ?? path ?? ""
  const lines = patch ? parseUnifiedDiff(decodeURIComponent(patch)) : []
  const addCount = lines.filter((l) => l.type === "add").length
  const delCount = lines.filter((l) => l.type === "del").length

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 6,
        paddingBottom: 10,
        paddingHorizontal: 14,
        backgroundColor: c.card,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={20} color={c.fg} />
        </Pressable>
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
