import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  Platform, ScrollView, Modal,
} from "react-native"
import { KeyboardAvoidingView } from "react-native"
import { useRouter } from "expo-router"
import { Stack } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useModal } from "../components/Modal"
import {
  getServers, addServer, removeServer, updateServer, setActiveServerId,
  getActiveServerId, parseConnectionString, type HuxfluxServer,
} from "@huxflux/shared"
import { useServerStatus } from "@huxflux/shared"
import { c } from "../theme"

async function validateAuth(url: string, token?: string): Promise<"ok" | "unauthorized" | "unreachable"> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${url}/api/config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) return "unauthorized"
    if (!res.ok) return "unreachable"
    return "ok"
  } catch {
    return "unreachable"
  } finally {
    clearTimeout(timer)
  }
}

function StatusDot({ status }: { status: "online" | "offline" | "checking" | "unauthorized" }) {
  const color =
    status === "online" ? c.success :
    status === "offline" ? c.error :
    status === "unauthorized" ? c.warning :
    c.fgSub
  const label =
    status === "online" ? "Online" :
    status === "offline" ? "Offline" :
    status === "unauthorized" ? "Unauthorized" :
    "Checking…"
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: c.fgSub, fontSize: 11 }}>{label}</Text>
    </View>
  )
}

export default function ServersScreen() {
  const router = useRouter()
  const modal = useModal()
  const [servers, setServers] = useState<HuxfluxServer[]>(getServers)
  const [activeId, setActiveId] = useState<string | null>(getActiveServerId)
  const statuses = useServerStatus(servers)

  // Add form
  const [input, setInput] = useState("")
  const [name, setName] = useState("")
  const [addToken, setAddToken] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  // Edit state: which server is being edited
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editUrl, setEditUrl] = useState("")
  const [editToken, setEditToken] = useState("")

  // QR scanner
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()

  function refresh() {
    setServers(getServers())
    setActiveId(getActiveServerId())
  }

  async function handleAdd() {
    const trimmed = input.trim()
    if (!trimmed || addLoading) return
    const parsed = parseConnectionString(trimmed)
    if (!parsed) {
      modal.showAlert("Invalid URL", "Enter a valid http(s):// or huxflux:// URL")
      return
    }
    const token = addToken.trim() || parsed.token
    setAddError(null)
    setAddLoading(true)
    try {
      const result = await validateAuth(parsed.url, token)
      if (result === "unreachable") { setAddError("Could not reach server."); return }
      if (result === "unauthorized") { setAddError("Invalid auth token."); return }
      const serverName = name.trim() || new URL(parsed.url).hostname
      const server = addServer({ name: serverName, url: parsed.url, token })
      if (servers.length === 0) setActiveServerId(server.id)
      setInput("")
      setName("")
      setAddToken("")
      setAdding(false)
      refresh()
    } finally {
      setAddLoading(false)
    }
  }

  function handleStartEdit(server: HuxfluxServer) {
    setEditingId(server.id)
    setEditName(server.name)
    setEditUrl(server.url)
    setEditToken(server.token ?? "")
  }

  async function handleSaveEdit() {
    if (!editingId || editLoading) return
    const trimmedUrl = editUrl.trim()
    if (!trimmedUrl) return
    const trimmedToken = editToken.trim()
    if (!trimmedToken) { setEditError("Auth token is required."); return }
    setEditError(null)
    setEditLoading(true)
    try {
      const result = await validateAuth(trimmedUrl, trimmedToken)
      if (result === "unreachable") { setEditError("Could not reach server."); return }
      if (result === "unauthorized") { setEditError("Invalid auth token."); return }
      updateServer(editingId, {
        name: editName.trim() || new URL(trimmedUrl).hostname,
        url: trimmedUrl,
        token: trimmedToken || undefined,
      })
      setEditingId(null)
      refresh()
    } finally {
      setEditLoading(false)
    }
  }

  function handleSetActive(id: string) {
    setActiveServerId(id)
    refresh()
  }

  function handleRemove(id: string) {
    modal.showConfirm("Remove server", "Are you sure?", "Remove", () => {
      removeServer(id)
      refresh()
    }, true)
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) {
        modal.showAlert("Camera access required", "Allow camera access to scan QR codes.")
        return
      }
    }
    setScanned(false)
    setScanning(true)
  }

  async function handleBarcodeScan({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)
    setScanning(false)

    const parsed = parseConnectionString(data)
    if (!parsed) {
      modal.showAlert("Invalid QR code", "This QR code doesn't contain a valid server connection.")
      setScanned(false)
      return
    }

    const token = parsed.token ?? ""
    if (!token) {
      modal.showAlert("No token", "QR code doesn't include an auth token.")
      setScanned(false)
      return
    }

    const result = await validateAuth(parsed.url, token)
    if (result === "unreachable") {
      modal.showAlert("Unreachable", "Could not reach server.")
      setScanned(false)
      return
    }
    if (result === "unauthorized") {
      modal.showAlert("Unauthorized", "Invalid auth token.")
      setScanned(false)
      return
    }

    const serverName = new URL(parsed.url).hostname
    const server = addServer({ name: serverName, url: parsed.url, token })
    if (servers.length === 0) setActiveServerId(server.id)
    refresh()
    modal.showAlert("Connected", `Server "${serverName}" added successfully.`)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior="padding"
    >
      <Stack.Screen
        options={{
          title: "Servers",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Text style={{ color: c.accent, fontSize: 16, fontWeight: "600" }}>Done</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
          Connected Servers
        </Text>

        {servers.length === 0 && (
          <Text style={{ color: c.fgSub, fontSize: 14, marginBottom: 16 }}>No servers added yet</Text>
        )}

        {servers.map((server) => (
          editingId === server.id ? (
            /* ── Inline edit form ── */
            <View key={server.id} style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.accent, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Name"
                placeholderTextColor={c.placeholder}
                style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 14, marginBottom: 8 }}
              />
              <TextInput
                value={editUrl}
                onChangeText={setEditUrl}
                placeholder="http://192.168.1.x:4321"
                placeholderTextColor={c.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 13, fontFamily: "monospace", marginBottom: 8 }}
              />
              <TextInput
                value={editToken}
                onChangeText={setEditToken}
                placeholder="Auth token"
                placeholderTextColor={c.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 13, fontFamily: "monospace", marginBottom: 12 }}
              />
              {editError && (
                <Text style={{ color: c.error, fontSize: 12, marginBottom: 8, marginTop: -4 }}>{editError}</Text>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setEditingId(null); setEditError(null) }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: c.secondary, alignItems: "center" }}
                >
                  <Text style={{ color: c.fgSub, fontWeight: "500" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  disabled={editLoading}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", opacity: editLoading ? 0.6 : 1 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>{editLoading ? "Verifying…" : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* ── Server row ── */
            <TouchableOpacity
              key={server.id}
              onPress={() => handleSetActive(server.id)}
              style={{
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: server.id === activeId ? c.accent : c.border,
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
                <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{server.name}</Text>
                {statuses[server.id] === "unauthorized"
                  ? <Text style={{ color: c.warning, fontSize: 12, marginTop: 2 }}>Auth failed — tap edit to update token</Text>
                  : <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{server.url}</Text>
                }
              </View>
              {server.id === activeId && statuses[server.id] !== "unauthorized" && (
                <Text style={{ color: c.accent, fontSize: 12, fontWeight: "600" }}>Active</Text>
              )}
              <TouchableOpacity onPress={() => handleStartEdit(server)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="pencil-outline" size={15} color={statuses[server.id] === "unauthorized" ? c.warning : c.fgSub} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemove(server.id)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={15} color={c.fgSub} />
              </TouchableOpacity>
            </TouchableOpacity>
          )
        ))}

        {adding ? (
          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginTop: 8 }}>
            <Text style={{ color: c.fg, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Add Server</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name (optional)"
              placeholderTextColor={c.placeholder}
              style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 14, marginBottom: 8 }}
            />
            <TextInput
              value={input}
              onChangeText={(v) => { setInput(v); setAddError(null) }}
              placeholder="http://192.168.1.x:4321 or huxflux://..."
              placeholderTextColor={c.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 13, fontFamily: "monospace", marginBottom: 8 }}
            />
            <TextInput
              value={addToken}
              onChangeText={(v) => { setAddToken(v); setAddError(null) }}
              placeholder="Auth token"
              placeholderTextColor={c.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 13, fontFamily: "monospace", marginBottom: 12 }}
            />
            {addError && (
              <Text style={{ color: c.error, fontSize: 12, marginBottom: 10, marginTop: -4 }}>{addError}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => { setAdding(false); setAddError(null) }}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: c.secondary, alignItems: "center" }}
              >
                <Text style={{ color: c.fgSub, fontWeight: "500" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                disabled={addLoading || !input.trim() || !addToken.trim()}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", opacity: (addLoading || !input.trim() || !addToken.trim()) ? 0.5 : 1 }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>{addLoading ? "Verifying…" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              onPress={() => setAdding(true)}
              style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderStyle: "dashed", borderRadius: 12, padding: 14, alignItems: "center" }}
            >
              <Text style={{ color: c.fgSub, fontSize: 14 }}>+ Add Server</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openScanner}
              style={{ borderWidth: 1, borderColor: c.border, borderStyle: "dashed", borderRadius: 12, padding: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="qr-code-outline" size={20} color={c.fgSub} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* QR Scanner Modal */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
          />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <View style={{ width: 220, height: 220, borderRadius: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" }} />
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 16, textAlign: "center" }}>Point at server QR code</Text>
          </View>
          <View style={{ position: "absolute", top: 56, right: 20 }}>
            <TouchableOpacity
              onPress={() => setScanning(false)}
              style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8 }}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}
