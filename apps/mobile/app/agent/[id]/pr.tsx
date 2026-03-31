import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Alert } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, useAgent, type PRDetails, type PRCheck } from "@hive/shared"
import { useState } from "react"
import { c, prColors } from "../../../theme"

function CheckRow({ check }: { check: PRCheck }) {
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

function ReviewRow({ author, state }: { author: string; state: string }) {
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

export default function PRScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: agent } = useAgent(id ?? null)
  const [markingReady, setMarkingReady] = useState(false)
  const [rerequesting, setRerequesting] = useState(false)

  const { data: pr, isLoading } = useQuery({
    queryKey: ["pr-details", id],
    queryFn: () => api.getPRDetails(id!),
    enabled: !!id && !!agent?.prNumber,
    staleTime: 30_000,
  })

  async function handleMarkReady() {
    setMarkingReady(true)
    try {
      await api.markPRReady(id!)
      queryClient.invalidateQueries({ queryKey: ["pr-details", id] })
      queryClient.invalidateQueries({ queryKey: ["agent", id] })
    } catch (e: any) {
      Alert.alert("Error", e.message)
    } finally {
      setMarkingReady(false)
    }
  }

  async function handleRerequest() {
    setRerequesting(true)
    try {
      await api.rerequestReview(id!)
      queryClient.invalidateQueries({ queryKey: ["pr-details", id] })
    } catch (e: any) {
      Alert.alert("Error", e.message)
    } finally {
      setRerequesting(false)
    }
  }

  if (!agent?.prNumber) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>No pull request for this agent yet.</Text>
      </View>
    )
  }

  if (isLoading || !pr) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

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
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* PR header */}
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

      {/* Action buttons */}
      <View style={{ gap: 10, marginBottom: 20 }}>
        {pr.draft && !pr.merged && (
          <TouchableOpacity
            onPress={handleMarkReady}
            disabled={markingReady}
            style={{ backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: c.white, fontWeight: "600", fontSize: 14 }}>
              {markingReady ? "Marking ready…" : "Mark ready for review"}
            </Text>
          </TouchableOpacity>
        )}
        {(pr.hasChangeRequests || pr.hasDismissedReviews) && !pr.merged && (
          <TouchableOpacity
            onPress={handleRerequest}
            disabled={rerequesting}
            style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: c.fgBright, fontWeight: "500", fontSize: 14 }}>
              {rerequesting ? "Re-requesting…" : "Re-request review"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Reviews */}
      {pr.reviews.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Reviews
          </Text>
          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
            {pr.reviews.map((r, i) => (
              <ReviewRow key={i} author={r.author} state={r.state} />
            ))}
          </View>
        </View>
      )}

      {/* Checks */}
      {pr.checks.length > 0 && (
        <View>
          <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Checks
          </Text>
          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
            {pr.checks.map((ch, i) => (
              <CheckRow key={i} check={ch} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}
