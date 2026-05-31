import { View, Text, TouchableOpacity, Linking } from "react-native"
import type { PRCheck } from "@huxflux/shared"
import { c } from "@/theme"

export function PRCheckRow({ check }: { check: PRCheck }) {
  const isPass    = check.conclusion === "success" || check.conclusion === "skipped"
  const isFail    = check.conclusion === "failure" || check.conclusion === "timed_out" || check.conclusion === "action_required"
  const isPending = check.status !== "completed"

  const color = isPending ? c.warning : isPass ? c.success : isFail ? c.error : c.fgSub
  const icon  = isPending ? "○" : isPass ? "✓" : isFail ? "✗" : "–"

  return (
    <TouchableOpacity
      onPress={() => check.url && Linking.openURL(check.url)}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}
    >
      <Text style={{ color, fontSize: 14, width: 18 }}>{icon}</Text>
      <Text style={{ color: c.fgBright, fontSize: 13, flex: 1 }} numberOfLines={1}>{check.name}</Text>
      {check.url && <Text style={{ color: c.fgSub, fontSize: 12 }}>›</Text>}
    </TouchableOpacity>
  )
}

export function PRReviewRow({ author, state }: { author: string; state: string }) {
  const stateConfig = {
    APPROVED:          { label: "Approved",          color: c.success },
    CHANGES_REQUESTED: { label: "Changes requested", color: c.error },
    DISMISSED:         { label: "Dismissed",         color: c.warning },
    COMMENTED:         { label: "Commented",         color: c.fgSub },
    PENDING:           { label: "Pending",           color: c.fgSub },
  }[state] ?? { label: state, color: c.fgSub }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "700" }}>{author[0]?.toUpperCase()}</Text>
      </View>
      <Text style={{ color: c.fgBright, fontSize: 13, flex: 1 }}>{author}</Text>
      <Text style={{ color: stateConfig.color, fontSize: 12 }}>{stateConfig.label}</Text>
    </View>
  )
}
