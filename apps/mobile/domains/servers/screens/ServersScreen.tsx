import { useState } from "react"
import { Text, TouchableOpacity, ScrollView, KeyboardAvoidingView } from "react-native"
import { useRouter, Stack } from "expo-router"
import { useCameraPermissions } from "expo-camera"
import {
  getServers, addServer, removeServer, updateServer, setActiveServerId,
  getActiveServerId, parseConnectionString, useServerStatus,
  type HuxfluxServer,
} from "@huxflux/shared"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { ServerRow } from "../components/ServerRow"
import { ServerEditForm } from "../components/ServerEditForm"
import { AddServerForm, AddServerButtons } from "../components/AddServerForm"
import { QRScannerModal } from "../components/QRScannerModal"

// `c.accent` is not defined in theme.ts (pre-existing bug, see agents README) —
// preserved verbatim from source via a typed cast.
const accent = (c as Record<string, string>).accent

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

interface AddState {
  input: string
  name: string
  token: string
  error: string | null
  loading: boolean
}

function useAddServer(refresh: () => void, currentLen: () => number) {
  const [adding, setAdding] = useState(false)
  const [state, setState] = useState<AddState>({ input: "", name: "", token: "", error: null, loading: false })
  const modal = useModal()

  function reset() {
    setAdding(false)
    setState({ input: "", name: "", token: "", error: null, loading: false })
  }

  async function submit() {
    const trimmed = state.input.trim()
    if (!trimmed || state.loading) return
    const parsed = parseConnectionString(trimmed)
    if (!parsed) {
      modal.showAlert("Invalid URL", "Enter a valid http(s):// or huxflux:// URL")
      return
    }
    const token = state.token.trim() || parsed.token
    setState((s) => ({ ...s, error: null, loading: true }))
    try {
      const result = await validateAuth(parsed.url, token)
      if (result === "unreachable") { setState((s) => ({ ...s, error: "Could not reach server.", loading: false })); return }
      if (result === "unauthorized") { setState((s) => ({ ...s, error: "Invalid auth token.", loading: false })); return }
      const serverName = state.name.trim() || new URL(parsed.url).hostname
      const server = addServer({ name: serverName, url: parsed.url, token })
      if (currentLen() === 0) setActiveServerId(server.id)
      reset()
      refresh()
    } finally {
      setState((s) => ({ ...s, loading: false }))
    }
  }

  return { adding, setAdding, state, setState, submit, reset }
}

interface EditState {
  id: string | null
  name: string
  url: string
  token: string
  error: string | null
  loading: boolean
}

function useEditServer(refresh: () => void) {
  const [state, setState] = useState<EditState>({ id: null, name: "", url: "", token: "", error: null, loading: false })

  function start(server: HuxfluxServer) {
    setState({ id: server.id, name: server.name, url: server.url, token: server.token ?? "", error: null, loading: false })
  }

  function cancel() {
    setState((s) => ({ ...s, id: null, error: null }))
  }

  async function save() {
    if (!state.id || state.loading) return
    const trimmedUrl = state.url.trim()
    if (!trimmedUrl) return
    const trimmedToken = state.token.trim()
    if (!trimmedToken) { setState((s) => ({ ...s, error: "Auth token is required." })); return }
    setState((s) => ({ ...s, error: null, loading: true }))
    try {
      const result = await validateAuth(trimmedUrl, trimmedToken)
      if (result === "unreachable") { setState((s) => ({ ...s, error: "Could not reach server.", loading: false })); return }
      if (result === "unauthorized") { setState((s) => ({ ...s, error: "Invalid auth token.", loading: false })); return }
      updateServer(state.id, {
        name: state.name.trim() || new URL(trimmedUrl).hostname,
        url: trimmedUrl,
        token: trimmedToken || undefined,
      })
      setState((s) => ({ ...s, id: null, loading: false }))
      refresh()
    } finally {
      setState((s) => ({ ...s, loading: false }))
    }
  }

  return { state, setState, start, cancel, save }
}

function useQRScanner(servers: HuxfluxServer[], refresh: () => void) {
  const modal = useModal()
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()

  async function open() {
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

  async function onScan({ data }: { data: string }) {
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
    if (result === "unreachable") { modal.showAlert("Unreachable", "Could not reach server."); setScanned(false); return }
    if (result === "unauthorized") { modal.showAlert("Unauthorized", "Invalid auth token."); setScanned(false); return }
    const serverName = new URL(parsed.url).hostname
    const server = addServer({ name: serverName, url: parsed.url, token })
    if (servers.length === 0) setActiveServerId(server.id)
    refresh()
    modal.showAlert("Connected", `Server "${serverName}" added successfully.`)
  }

  return { scanning, scanned, setScanning, open, onScan }
}

export function ServersScreen() {
  const router = useRouter()
  const modal = useModal()
  const [servers, setServers] = useState<HuxfluxServer[]>(getServers)
  const [activeId, setActiveId] = useState<string | null>(getActiveServerId)
  const statuses = useServerStatus(servers)

  function refresh() {
    setServers(getServers())
    setActiveId(getActiveServerId())
  }

  const add = useAddServer(refresh, () => servers.length)
  const edit = useEditServer(refresh)
  const qr = useQRScanner(servers, refresh)

  function handleRemove(id: string) {
    modal.showConfirm("Remove server", "Are you sure?", "Remove", () => {
      removeServer(id)
      refresh()
    }, true)
  }

  function handleSetActive(id: string) {
    setActiveServerId(id)
    refresh()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <Stack.Screen
        options={{
          title: "Servers",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Text style={{ color: accent, fontSize: 16, fontWeight: "600" }}>Done</Text>
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

        {servers.map((server) =>
          edit.state.id === server.id ? (
            <ServerEditForm
              key={server.id}
              name={edit.state.name}
              setName={(name) => edit.setState((s) => ({ ...s, name }))}
              url={edit.state.url}
              setUrl={(url) => edit.setState((s) => ({ ...s, url }))}
              token={edit.state.token}
              setToken={(token) => edit.setState((s) => ({ ...s, token }))}
              error={edit.state.error}
              loading={edit.state.loading}
              onCancel={edit.cancel}
              onSave={edit.save}
            />
          ) : (
            <ServerRow
              key={server.id}
              server={server}
              status={statuses[server.id] ?? "checking"}
              isActive={server.id === activeId}
              onSelect={() => handleSetActive(server.id)}
              onEdit={() => edit.start(server)}
              onRemove={() => handleRemove(server.id)}
            />
          ),
        )}

        {add.adding ? (
          <AddServerForm
            name={add.state.name}
            setName={(name) => add.setState((s) => ({ ...s, name }))}
            input={add.state.input}
            setInput={(input) => add.setState((s) => ({ ...s, input, error: null }))}
            token={add.state.token}
            setToken={(token) => add.setState((s) => ({ ...s, token, error: null }))}
            error={add.state.error}
            loading={add.state.loading}
            onCancel={add.reset}
            onAdd={add.submit}
          />
        ) : (
          <AddServerButtons onAdd={() => add.setAdding(true)} onScan={qr.open} />
        )}
      </ScrollView>

      <QRScannerModal
        visible={qr.scanning}
        scanned={qr.scanned}
        onClose={() => qr.setScanning(false)}
        onScan={qr.onScan}
      />
    </KeyboardAvoidingView>
  )
}
