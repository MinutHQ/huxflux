import { View, Text, Pressable } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { c } from "@/theme"

export function UnauthorizedBanner() {
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push("/servers")}
      style={{ backgroundColor: "rgba(251,191,36,0.12)", borderBottomWidth: 1, borderBottomColor: "rgba(251,191,36,0.25)", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <Ionicons name="warning-outline" size={15} color={c.warning} />
      <Text style={{ color: c.warning, fontSize: 12, flex: 1 }}>Authentication failed — tap to update token</Text>
      <Ionicons name="chevron-forward" size={13} color={c.warning} />
    </Pressable>
  )
}

export function DisconnectedBanner() {
  return (
    <View style={{ backgroundColor: "rgba(239,68,68,0.12)", borderBottomWidth: 1, borderBottomColor: "rgba(239,68,68,0.25)", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name="wifi-outline" size={15} color={c.error} />
      <Text style={{ color: c.error, fontSize: 12, flex: 1 }}>Disconnected — reconnecting…</Text>
    </View>
  )
}

export function GroupByToggle({ groupBy, onSelect }: { groupBy: "status" | "repo"; onSelect: (g: "status" | "repo") => void }) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingVertical: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: c.border }}>
      {(["status", "repo"] as const).map((g) => (
        <Pressable
          key={g}
          onPress={() => onSelect(g)}
          style={{
            paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6,
            backgroundColor: groupBy === g ? c.secondary : "transparent",
          }}
        >
          <Text style={{ color: groupBy === g ? c.fg : c.fgSub, fontSize: 12, fontWeight: groupBy === g ? "600" : "400" }}>
            {g === "status" ? "By Status" : "By Repo"}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
