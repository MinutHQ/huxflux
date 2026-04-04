import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Linking, TextInput } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, useAgent, type PRDetails, type PRCheck, type PRThread, type PRIssueComment } from "@huxflux/shared"
import { useState } from "react"
import { c, prColors } from "../../../theme"
import { useModal } from "../../../components/Modal"

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ThreadCard({
  thread,
  repoId,
  prNumber,
  onUpdated,
}: {
  thread: PRThread
  repoId: string
  prNumber: number
  onUpdated: () => void
}) {
  const modal = useModal()
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const rootComment = thread.comments[0]
  if (!rootComment) return null

  async function handleReply() {
    if (!replyText.trim() || !rootComment.databaseId) return
    setSending(true)
    try {
      await api.replyToPRComment(repoId, prNumber, rootComment.databaseId, replyText.trim())
      setReplyText("")
      onUpdated()
    } catch (e: any) {
      modal.showAlert("Error", e.message)
    } finally {
      setSending(false)
    }
  }

  async function handleResolve() {
    setResolving(true)
    try {
      await api.resolveThread(thread.id)
      onUpdated()
    } catch (e: any) {
      modal.showAlert("Error", e.message)
    } finally {
      setResolving(false)
    }
  }

  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      {/* File location */}
      {thread.path && (
        <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", marginBottom: 8 }}>
          {thread.path}{thread.line ? `:${thread.line}` : ""}
        </Text>
      )}

      {/* Comments */}
      {thread.comments.map((comment, i) => (
        <View key={comment.id} style={{ marginBottom: i < thread.comments.length - 1 ? 10 : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.fgSub, fontSize: 9, fontWeight: "700" }}>{comment.author[0]?.toUpperCase()}</Text>
            </View>
            <Text style={{ color: c.fgBright, fontSize: 12, fontWeight: "600" }}>{comment.author}</Text>
            <Text style={{ color: c.fgSub, fontSize: 10 }}>{timeAgo(comment.createdAt)}</Text>
          </View>
          <Text style={{ color: c.fg, fontSize: 13, lineHeight: 19, paddingLeft: 26 }}>{comment.body}</Text>
        </View>
      ))}

      {/* Reply + resolve */}
      <View style={{ marginTop: 10, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Reply…"
            placeholderTextColor={c.placeholder}
            style={{
              flex: 1, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8, color: c.fg, fontSize: 13,
            }}
          />
          <TouchableOpacity
            onPress={handleReply}
            disabled={sending || !replyText.trim()}
            style={{
              backgroundColor: replyText.trim() && !sending ? c.fgBright : c.secondary,
              borderRadius: 8, paddingHorizontal: 12, justifyContent: "center",
            }}
          >
            {sending
              ? <ActivityIndicator size="small" color={c.bg} />
              : <Text style={{ color: replyText.trim() ? c.bg : c.fgSub, fontSize: 12, fontWeight: "600" }}>Send</Text>
            }
          </TouchableOpacity>
        </View>
        {!thread.isResolved && (
          <TouchableOpacity
            onPress={handleResolve}
            disabled={resolving}
            style={{ alignSelf: "flex-start" }}
          >
            <Text style={{ color: c.success, fontSize: 12, fontWeight: "500" }}>
              {resolving ? "Resolving…" : "Resolve thread"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function IssueCommentCard({ comment }: { comment: PRIssueComment }) {
  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: c.fgSub, fontSize: 9, fontWeight: "700" }}>{comment.author[0]?.toUpperCase()}</Text>
        </View>
        <Text style={{ color: c.fgBright, fontSize: 12, fontWeight: "600" }}>{comment.author}</Text>
        <Text style={{ color: c.fgSub, fontSize: 10 }}>{timeAgo(comment.createdAt)}</Text>
      </View>
      <Text style={{ color: c.fg, fontSize: 13, lineHeight: 19, paddingLeft: 26 }}>{comment.body}</Text>
    </View>
  )
}

export default function PRScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const modal = useModal()
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
      modal.showAlert("Error", e.message)
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
      modal.showAlert("Error", e.message)
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
            style={{ backgroundColor: c.fgBright, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: c.fgBrightFg, fontWeight: "600", fontSize: 14 }}>
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
        <View style={{ marginBottom: 20 }}>
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

      {/* Review threads */}
      {(() => {
        const openThreads = pr.threads.filter((t) => !t.isResolved && t.comments.length > 0)
        if (openThreads.length === 0) return null
        return (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Review Comments ({openThreads.length})
            </Text>
            {openThreads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                repoId={agent?.repoId ?? ""}
                prNumber={agent?.prNumber ?? 0}
                onUpdated={() => queryClient.invalidateQueries({ queryKey: ["pr-details", id] })}
              />
            ))}
          </View>
        )
      })()}

      {/* Discussion comments */}
      {pr.issueComments.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Discussion ({pr.issueComments.length})
          </Text>
          {pr.issueComments.map((comment) => (
            <IssueCommentCard key={comment.id} comment={comment} />
          ))}
        </View>
      )}
    </ScrollView>
  )
}
