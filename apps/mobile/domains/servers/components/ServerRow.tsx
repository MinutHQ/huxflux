import { View, Text, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { HuxfluxServer, ServerStatus } from "@huxflux/shared"
import { c } from "@/theme"

// `c.accent` is not defined in theme.ts (pre-existing bug, see agents README) —
// preserved verbatim from source via a typed cast.
const accent = (c as Record<string, string>).accent

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
  server, status, isActive, onSelect, onEdit, onRemove,
}: {
  server: HuxfluxServer
  status: ServerStatus
  isActive: boolean
  onSelect: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onSelect}
      style={{
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: isActive ? accent : c.border,
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
        {status === "unauthorized"
          ? <Text style={{ color: c.warning, fontSize: 12, marginTop: 2 }}>Auth failed — tap edit to update token</Text>
          : <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{server.url}</Text>
        }
      </View>
      {isActive && status !== "unauthorized" && (
        <Text style={{ color: accent, fontSize: 12, fontWeight: "600" }}>Active</Text>
      )}
      <TouchableOpacity onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="pencil-outline" size={15} color={status === "unauthorized" ? c.warning : c.fgSub} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="trash-outline" size={15} color={c.fgSub} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}
