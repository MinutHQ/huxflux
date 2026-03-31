import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native"
import { useRouter } from "expo-router"
import { Stack } from "expo-router"
import {
  getServers, addServer, removeServer, setActiveServerId,
  getActiveServerId, parseConnectionString, type HiveServer,
} from "@hive/shared"
import { useServerStatus } from "@hive/shared"

function StatusDot({ status }: { status: "online" | "offline" | "checking" }) {
  const color = status === "online" ? "#10b981" : status === "offline" ? "#f87171" : "#71717a"
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
}

export default function ServersScreen() {
  const router = useRouter()
  const [servers, setServers] = useState<HiveServer[]>(getServers)
  const [activeId, setActiveId] = useState<string | null>(getActiveServerId)
  const statuses = useServerStatus(servers)

  const [input, setInput] = useState("")
  const [name, setName] = useState("")
  const [adding, setAdding] = useState(false)

  function refresh() {
    setServers(getServers())
    setActiveId(getActiveServerId())
  }

  function handleAdd() {
    const trimmed = input.trim()
    if (!trimmed) return
    const parsed = parseConnectionString(trimmed)
    if (!parsed) {
      Alert.alert("Invalid URL", "Enter a valid http(s):// or huxflux:// URL")
      return
    }
    const serverName = name.trim() || new URL(parsed.url).hostname
    const server = addServer({ name: serverName, url: parsed.url, token: parsed.token })
    // Auto-activate the first server added
    if (servers.length === 0) setActiveServerId(server.id)
    setInput("")
    setName("")
    setAdding(false)
    refresh()
  }

  function handleSetActive(id: string) {
    setActiveServerId(id)
    refresh()
  }

  function handleRemove(id: string) {
    Alert.alert("Remove server", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: () => {
          removeServer(id)
          refresh()
        },
      },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          title: "Servers",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Text style={{ color: "#60a5fa", fontSize: 16, fontWeight: "600" }}>Done</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: "#71717a", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
          Connected Servers
        </Text>

        {servers.length === 0 && (
          <Text style={{ color: "#71717a", fontSize: 14, marginBottom: 16 }}>No servers added yet</Text>
        )}

        {servers.map((server) => (
          <TouchableOpacity
            key={server.id}
            onPress={() => handleSetActive(server.id)}
            style={{
              backgroundColor: "#111111",
              borderWidth: 1,
              borderColor: server.id === activeId ? "#3b82f6" : "#1f1f1f",
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <StatusDot status={statuses[server.id] ?? "checking"} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fafafa", fontSize: 14, fontWeight: "500" }}>{server.name}</Text>
              <Text style={{ color: "#71717a", fontSize: 12, marginTop: 2 }}>{server.url}</Text>
            </View>
            {server.id === activeId && (
              <Text style={{ color: "#3b82f6", fontSize: 12, fontWeight: "600" }}>Active</Text>
            )}
            <TouchableOpacity onPress={() => handleRemove(server.id)} hitSlop={8}>
              <Text style={{ color: "#71717a", fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        {adding ? (
          <View style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#1f1f1f", borderRadius: 12, padding: 14, marginTop: 8 }}>
            <Text style={{ color: "#fafafa", fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Add Server</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name (optional)"
              placeholderTextColor="#3f3f46"
              style={{ backgroundColor: "#0a0a0a", borderWidth: 1, borderColor: "#1f1f1f", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: "#fafafa", fontSize: 14, marginBottom: 8 }}
            />
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="http://192.168.1.x:3001 or huxflux://..."
              placeholderTextColor="#3f3f46"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={{ backgroundColor: "#0a0a0a", borderWidth: 1, borderColor: "#1f1f1f", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: "#fafafa", fontSize: 13, fontFamily: "monospace", marginBottom: 12 }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setAdding(false)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#1f1f1f", alignItems: "center" }}
              >
                <Text style={{ color: "#a1a1aa", fontWeight: "500" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#3b82f6", alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setAdding(true)}
            style={{ borderWidth: 1, borderColor: "#1f1f1f", borderStyle: "dashed", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ color: "#71717a", fontSize: 14 }}>+ Add Server</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
