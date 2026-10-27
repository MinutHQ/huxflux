import { View, Text, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { HuxfluxServer, ServerStatus } from "@huxflux/shared"
import { c } from "@/theme"

export function StatusDot({ status }: { status: ServerStatus }) {
  const color =
    status === "online" ? c.success :
    status === "offline" ? c.error :
    status === "unauthorized" ? c.warning :
    c.fgSub
  const label =
    status === "online" ? "Online" :
    status === "offline" ? "Offline" :
    status === "unauthorized" ? "Unauthorized" :
    "Checking..."
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: c.fgSub, fontSize: 11 }}>{label}</Text>
    </View>
  )
}

export function ServerRow({
  server, status, isActive, reauthing, onSelect, onEdit, onReauth, onRemove,
}: {
  server: HuxfluxServer
  status: ServerStatus
  isActive: boolean
  reauthing: boolean
  onSelect: () => void
  onEdit: () => void
  /** Present only for proxied servers: re-runs the proxy sign-in, or cancels it while `reauthing`. */
  onReauth?: () => void
  onRemove: () => void
}) {
  const unauthorizedHint = onReauth ? "Sign-in expired — tap the key to sign in again" : "Auth failed — tap edit to update token"
  return (
    <TouchableOpacity
      onPress={onSelect}
      style={{
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: isActive ? c.accent : c.border,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <StatusDot status={status} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{server.name}</Text>
        {reauthing
          ? <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>Waiting for sign-in in Safari — tap ✕ to cancel</Text>
          : status === "unauthorized"
          ? <Text style={{ color: c.warning, fontSize: 12, marginTop: 2 }}>{unauthorizedHint}</Text>
          : <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{server.url}</Text>
        }
      </View>
      {isActive && status !== "unauthorized" && (
        <Text style={{ color: c.accent, fontSize: 12, fontWeight: "600" }}>Active</Text>
      )}
      {onReauth && (
        <TouchableOpacity onPress={onReauth} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name={reauthing ? "close-circle-outline" : "key-outline"} size={15} color={status === "unauthorized" ? c.warning : c.fgSub} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="pencil-outline" size={15} color={status === "unauthorized" && !onReauth ? c.warning : c.fgSub} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="trash-outline" size={15} color={c.fgSub} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}
