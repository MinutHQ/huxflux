import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { useRouter } from "expo-router"
import { c } from "@/theme"

export function CenteredSpinner() {
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={c.fgSub} />
    </View>
  )
}

export function NoServerState() {
  const router = useRouter()
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Text style={{ color: c.fg, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>No server connected</Text>
      <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center", marginBottom: 24 }}>Add a Huxflux server to get started</Text>
      <TouchableOpacity
        onPress={() => router.push("/servers")}
        style={{ backgroundColor: c.fgBright, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
      >
        <Text style={{ color: c.fgBrightFg, fontWeight: "600", fontSize: 14 }}>Add Server</Text>
      </TouchableOpacity>
    </View>
  )
}
