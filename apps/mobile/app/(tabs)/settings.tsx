import { View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { getActiveServer, getServers } from "@hive/shared"

export default function SettingsScreen() {
  const router = useRouter()
  const server = getActiveServer()
  const servers = getServers()

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0a", padding: 16 }}>
      <Text style={{ color: "#fafafa", fontSize: 20, fontWeight: "700", marginBottom: 20 }}>Settings</Text>

      <Text style={{ color: "#71717a", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        Server
      </Text>
      <TouchableOpacity
        onPress={() => router.push("/servers")}
        style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#1f1f1f", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View>
          <Text style={{ color: "#fafafa", fontSize: 14, fontWeight: "500" }}>
            {server ? server.name : "No server connected"}
          </Text>
          {server && <Text style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>{server.url}</Text>}
          <Text style={{ color: "#71717a", fontSize: 11, marginTop: 4 }}>{servers.length} server{servers.length !== 1 ? "s" : ""} configured</Text>
        </View>
        <Text style={{ color: "#71717a", fontSize: 16 }}>›</Text>
      </TouchableOpacity>
    </View>
  )
}
