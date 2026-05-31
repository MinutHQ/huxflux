import { View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { getActiveServer, getServers } from "@huxflux/shared"
import { c } from "@/theme"
import { SectionLabel } from "./SettingsRow"

export function SettingsServerCard() {
  const router = useRouter()
  const server = getActiveServer()
  const servers = getServers()

  return (
    <View>
      <SectionLabel label="Server" />
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
  )
}
