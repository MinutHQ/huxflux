import { View, Text, Pressable } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { statusConfig, type AgentStatus } from "@huxflux/shared"
import { c, statusColors } from "@/theme"

// ── Status icon (mirrors desktop Linear-style icons) ─────────────────────────

export function StatusIcon({ status, size = 14 }: { status: AgentStatus; size?: number }) {
  const color = statusColors[status]?.color ?? "#888"
  const icon: keyof typeof Ionicons.glyphMap =
      status === "done"        ? "checkmark-circle"
    : status === "in-review"   ? "git-pull-request"
    : status === "draft-pr"    ? "git-pull-request-outline"
    : status === "in-progress" ? "time"
    : status === "backlog"     ? "ellipse-outline"
    :                            "close-circle"
  return <Ionicons name={icon} size={size} color={color} style={{ flexShrink: 0 }} />
}

// ── Status section header ────────────────────────────────────────────────────

export function StatusSectionHeader({ status, count, collapsed, onToggle, onArchiveAll }: {
  status: AgentStatus
  count: number
  collapsed: boolean
  onToggle: () => void
  onArchiveAll?: () => void
}) {
  const sc = statusColors[status]
  const color = sc?.color ?? c.fgSub
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Pressable
        onPress={onToggle}
        style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={12} color={color} />
        <StatusIcon status={status} size={13} />
        <Text style={{ color, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
          {statusConfig[status].label}
        </Text>
        <Text style={{ color: c.placeholder, fontSize: 11, marginLeft: "auto" }}>{count}</Text>
      </Pressable>
      {onArchiveAll && count > 0 && (
        <Pressable onPress={onArchiveAll} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
          <Ionicons name="trash-outline" size={14} color={c.placeholder} />
        </Pressable>
      )}
    </View>
  )
}

// ── Repo section header ──────────────────────────────────────────────────────

export function RepoSectionHeader({ name, count, collapsed, onToggle }: {
  name: string
  count: number
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={{ paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={12} color={c.fgSub} />
      <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="code-slash-outline" size={12} color={c.fgSub} />
      </View>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "600", flex: 1 }}>{name}</Text>
      <Text style={{ color: c.placeholder, fontSize: 11 }}>{count}</Text>
    </Pressable>
  )
}
