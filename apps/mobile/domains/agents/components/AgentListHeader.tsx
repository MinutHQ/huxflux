import { View, Text, Pressable } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { c } from "@/theme"

export function AgentListHeader({
  insetsTop,
  serverName,
  isUnauthorized,
  serverStatusOffline,
  isDisconnected,
  repoFilter,
  activeRepoName,
  onShowServerSwitcher,
  onShowRepoFilter,
}: {
  insetsTop: number
  serverName: string
  isUnauthorized: boolean
  serverStatusOffline: boolean
  isDisconnected: boolean
  repoFilter: string
  activeRepoName: string | null
  onShowServerSwitcher: () => void
  onShowRepoFilter: () => void
}) {
  const router = useRouter()

  return (
    <View style={{
      paddingTop: insetsTop + 10,
      paddingBottom: 12,
      paddingHorizontal: 16,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 10,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={onShowServerSwitcher} style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isUnauthorized ? c.warning : (serverStatusOffline || isDisconnected) ? c.error : c.success }} />
          <Text style={{ color: isUnauthorized ? c.warning : c.fg, fontSize: 17, fontWeight: "700", letterSpacing: -0.4, flex: 1 }} numberOfLines={1}>
            {serverName}
          </Text>
          <Ionicons name="chevron-down" size={14} color={c.fgSub} style={{ marginLeft: -2 }} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/new-agent")}
          style={{ paddingHorizontal: 13, height: 34, borderRadius: 8, backgroundColor: c.fgBright, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, marginLeft: 12 }}
        >
          <Ionicons name="add" size={17} color={c.fgBrightFg} />
          <Text style={{ color: c.fgBrightFg, fontSize: 13, fontWeight: "600" }}>New</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => router.push("/add-repo")}
          style={{ width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="folder-open-outline" size={16} color={c.fgSub} />
        </Pressable>
        <Pressable
          onPress={onShowRepoFilter}
          style={{
            height: 34, borderRadius: 8, borderWidth: 1,
            borderColor: repoFilter !== "all" ? c.fg : c.border,
            backgroundColor: repoFilter !== "all" ? c.secondary : "transparent",
            alignItems: "center", justifyContent: "center",
            flexDirection: "row", gap: 4, paddingHorizontal: 10,
          }}
        >
          <Ionicons name="filter-outline" size={14} color={repoFilter !== "all" ? c.fg : c.fgSub} />
          {activeRepoName && (
            <Text style={{ color: c.fg, fontSize: 12, fontWeight: "500" }} numberOfLines={1}>
              {activeRepoName}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}
