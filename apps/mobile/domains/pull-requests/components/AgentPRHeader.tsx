import { View, Text, TouchableOpacity, Linking } from "react-native"
import type { PRDetails } from "@huxflux/shared"
import { c, prColors } from "@/theme"

export function AgentPRHeader({ pr }: { pr: PRDetails }) {
  const statusColor = pr.merged
    ? prColors.merged
    : pr.draft
    ? prColors.draft
    : pr.hasChangeRequests
    ? prColors.changesRequested
    : pr.mergeableState === "clean"
    ? prColors.readyToMerge
    : prColors.inReview

  const statusLabel = pr.merged
    ? "Merged"
    : pr.draft
    ? "Draft"
    : pr.hasChangeRequests
    ? "Changes requested"
    : pr.mergeableState === "clean"
    ? "Ready to merge"
    : "In review"

  const passCount    = pr.checks.filter((ch) => ch.conclusion === "success").length
  const failCount    = pr.checks.filter((ch) => ch.conclusion === "failure" || ch.conclusion === "timed_out").length
  const pendingCount = pr.checks.filter((ch) => ch.status !== "completed").length

  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.fg, fontSize: 16, fontWeight: "600", lineHeight: 22 }}>{pr.title}</Text>
          <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 4 }}>
            #{pr.number} · opened by {pr.author}
          </Text>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(pr.url)}>
          <Text style={{ color: c.link, fontSize: 13 }}>Open ↗</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
        <Text style={{ color: statusColor, fontSize: 13, fontWeight: "600" }}>{statusLabel}</Text>
      </View>

      {pr.checks.length > 0 && (
        <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
          {passCount > 0    && <Text style={{ color: c.success, fontSize: 12 }}>✓ {passCount} passing</Text>}
          {failCount > 0    && <Text style={{ color: c.error,   fontSize: 12 }}>✗ {failCount} failing</Text>}
          {pendingCount > 0 && <Text style={{ color: c.warning, fontSize: 12 }}>○ {pendingCount} pending</Text>}
        </View>
      )}
    </View>
  )
}

export function AgentPRActions({
  pr,
  markingReady,
  rerequesting,
  onMarkReady,
  onRerequest,
}: {
  pr: PRDetails
  markingReady: boolean
  rerequesting: boolean
  onMarkReady: () => void
  onRerequest: () => void
}) {
  return (
    <View style={{ gap: 10, marginBottom: 20 }}>
      {pr.draft && !pr.merged && (
        <TouchableOpacity
          onPress={onMarkReady}
          disabled={markingReady}
          style={{ backgroundColor: c.fgBright, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: c.fgBrightFg, fontWeight: "600", fontSize: 14 }}>
            {markingReady ? "Marking ready…" : "Mark ready for review"}
          </Text>
        </TouchableOpacity>
      )}
      {(pr.hasChangeRequests || pr.hasDismissedReviews) && !pr.merged && (
        <TouchableOpacity
          onPress={onRerequest}
          disabled={rerequesting}
          style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: c.fgBright, fontWeight: "500", fontSize: 14 }}>
            {rerequesting ? "Re-requesting…" : "Re-request review"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
