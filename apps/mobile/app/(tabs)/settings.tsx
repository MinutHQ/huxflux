import { View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getActiveServer, getServers } from "@hive/shared"
import { c } from "../../theme"

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const server = getActiveServer()
  const servers = getServers()

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 10,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: c.card,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", letterSpacing: -0.4 }}>Settings</Text>
      </View>

      <View style={{ padding: 16 }}>
        <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
          Server
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/servers")}
          style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>
              {server ? server.name : "No server connected"}
            </Text>
            {server && <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{server.url}</Text>}
            <Text style={{ color: c.fgSub, fontSize: 11, marginTop: 4 }}>{servers.length} server{servers.length !== 1 ? "s" : ""} configured</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.fgSub} />
        </TouchableOpacity>
      </View>
    </View>
  )
}
