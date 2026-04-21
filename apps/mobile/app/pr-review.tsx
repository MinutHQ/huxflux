import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Pressable, TextInput, KeyboardAvoidingView, Platform, Linking, Animated as RNAnimated } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getStorage, type PRFileDiff } from "@huxflux/shared"
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { c, prColors } from "../theme"
import { useModal } from "../components/Modal"
import { ReviewCommentCard, type ReviewComment } from "../components/ReviewCommentCard"
import { ThreadCard } from "../components/ThreadCard"
import { IssueCommentCard } from "../components/IssueCommentCard"
import { Markdown } from "../components/Markdown"
import { usePRReview, type ChatMessage } from "../hooks/usePRReview"

type Tab = "review" | "changes" | "conversations"

// ── File row for Changes tab ────────────────────────────────────────────────

function FileRow({
  file,
  viewed,
  onPress,
  onLongPress,
}: {
  file: PRFileDiff
  viewed: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  const statusIcon = file.status === "added" ? "+" : file.status === "deleted" ? "−" : file.status === "renamed" ? "→" : "~"
  const statusColor = file.status === "added" ? c.success : file.status === "deleted" ? c.error : file.status === "renamed" ? c.link : c.warning

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border,
        flexDirection: "row", alignItems: "center", gap: 10,
        opacity: viewed ? 0.5 : 1,
      }}
    >
      <Text style={{ color: statusColor, fontSize: 14, fontWeight: "700", width: 16, textAlign: "center" }}>{statusIcon}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.fg, fontSize: 13, fontFamily: "monospace" }} numberOfLines={1}>
          {file.path}
        </Text>
      </View>
      <Text style={{ color: c.success, fontSize: 11 }}>+{file.additions}</Text>
      <Text style={{ color: c.error, fontSize: 11 }}>-{file.deletions}</Text>
      {viewed && <Ionicons name="checkmark-circle" size={14} color={c.success} />}
      <Ionicons name="chevron-forward" size={14} color={c.fgSub} />
    </TouchableOpacity>
  )
}

// ── Chat bubble ─────────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  return (
    <View style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "85%",
      marginHorizontal: 16,
      marginVertical: 4,
      backgroundColor: isUser ? c.fgBright : c.card,
      borderWidth: isUser ? 0 : 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 12,
    }}>
      <Markdown content={message.content} fontSize={13} />
    </View>
  )
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function PRReviewScreen() {
  const params = useLocalSearchParams<{
    repoId: string; number: string
    title?: string; author?: string; url?: string; body?: string
    draft?: string; hasChangeRequests?: string; isReadyToMerge?: string
  }>()
  const repoId = params.repoId ?? ""
  const prNumber = parseInt(params.number ?? "0", 10)
  const prTitle = params.title ?? `PR #${prNumber}`
  const prAuthor = params.author ?? ""
  const prUrl = params.url ?? ""
  const prBody = params.body ?? ""
  const prDraft = params.draft === "1"
  const prHasChangeRequests = params.hasChangeRequests === "1"
  const prIsReadyToMerge = params.isReadyToMerge === "1"
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const modal = useModal()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<Tab>("review")
  const [chatInput, setChatInput] = useState("")
  const [merging, setMerging] = useState(false)
  const [submitClosing, setSubmitClosing] = useState(false)
  const closingOpacity = useRef(new RNAnimated.Value(0)).current
  const closingScale = useRef(new RNAnimated.Value(0.3)).current
  const closingCheckScale = useRef(new RNAnimated.Value(0)).current
  const listRef = useRef<FlatList>(null)

  // PR details — fetch for conversations tab and to detect outdated reviews
  const { data: prDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["pr-details-repo", repoId, prNumber],
    queryFn: () => api.getPRDetailsForRepo(repoId, prNumber),
    enabled: !!repoId && prNumber > 0,
    staleTime: 30_000,
  })

  // PR files (for changes tab) — also used by usePRReview for code context
  const { data: prFiles = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["pr-files", repoId, prNumber],
    queryFn: () => api.getPRFiles(repoId, prNumber),
    enabled: !!repoId && prNumber > 0,
    staleTime: 30_000,
  })

  // Viewed files
  const viewedKey = `huxflux:pr-viewed:${repoId}:${prNumber}`
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(() => {
    try {
      const raw = getStorage().getItem(viewedKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })

  const toggleViewed = useCallback((path: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      getStorage().setItem(viewedKey, JSON.stringify(Array.from(next)))
      return next
    })
  }, [viewedKey])

  // Review hook
  const review = usePRReview(repoId, prNumber)

  // Queued comments for submission
  const queuedComments = useMemo(() => {
    const all: ReviewComment[] = []
    for (const msg of review.messages) {
      if (msg.comments) {
        for (const c of msg.comments) {
          if (c.status === "queued") all.push(c)
        }
      }
    }
    return all
  }, [review.messages])

  // Submit review
  async function handleSubmitReview(event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT") {
    try {
      const comments = queuedComments
        .filter((c) => c.type === "inline" && c.path && c.line)
        .map((c) => ({ path: c.path!, line: c.line!, body: c.body }))
      const body = queuedComments
        .filter((c) => c.type === "general")
        .map((c) => c.body)
        .join("\n\n")

      await api.submitPRReview(repoId, prNumber, { event, body, comments })
      queryClient.invalidateQueries({ queryKey: ["prs"] })
      queryClient.invalidateQueries({ queryKey: ["pr-details-repo", repoId, prNumber] })

      // Show closing animation then navigate back
      setSubmitClosing(true)
      RNAnimated.parallel([
        RNAnimated.timing(closingOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        RNAnimated.spring(closingScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
      ]).start(() => {
        RNAnimated.spring(closingCheckScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start()
        setTimeout(() => {
          RNAnimated.timing(closingOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
            router.back()
          })
        }, 800)
      })
    } catch (e: any) {
      modal.showAlert("Error", e.message)
    }
  }

  function showSubmitOptions() {
    modal.showActionSheet("Submit Review", [
      { label: "Approve", onPress: () => handleSubmitReview("APPROVE") },
      { label: "Request Changes", onPress: () => handleSubmitReview("REQUEST_CHANGES") },
      { label: "Comment", onPress: () => handleSubmitReview("COMMENT") },
    ])
  }

  // Mark ready for review (draft PRs)
  async function handleMarkReady() {
    try {
      await api.markPRReady(params.agentId as string)
      queryClient.invalidateQueries({ queryKey: ["pr-details"] })
      modal.showAlert("PR marked ready for review")
    } catch (e: any) {
      modal.showAlert("Error", e.message)
    }
  }

  // Re-request review
  async function handleRerequestReview() {
    try {
      await api.rerequestReview(params.agentId as string)
      queryClient.invalidateQueries({ queryKey: ["pr-details"] })
      modal.showAlert("Review re-requested")
    } catch (e: any) {
      modal.showAlert("Error", e.message)
    }
  }

  // Merge
  async function handleMerge(method: "merge" | "squash" | "rebase") {
    setMerging(true)
    try {
      await api.mergePRByRepo(repoId, prNumber, method)
      queryClient.invalidateQueries({ queryKey: ["prs"] })
      modal.showAlert("PR merged")
      router.back()
    } catch (e: any) {
      modal.showAlert("Error", e.message)
    } finally {
      setMerging(false)
    }
  }

  function showMergeOptions() {
    modal.showActionSheet("Merge PR", [
      { label: "Squash & Merge", onPress: () => handleMerge("squash") },
      { label: "Merge Commit", onPress: () => handleMerge("merge") },
      { label: "Rebase & Merge", onPress: () => handleMerge("rebase") },
    ])
  }

  // Send chat
  async function handleSend() {
    const text = chatInput.trim()
    if (!text || review.isSending) return
    setChatInput("")
    await review.sendChat(text)
  }

  // Status info — use passed params for instant display, upgrade from prDetails when available
  const merged = prDetails?.merged ?? false
  const draft = prDetails?.draft ?? prDraft
  const hasChanges = prDetails?.hasChangeRequests ?? prHasChangeRequests
  const readyToMerge = prDetails?.mergeableState === "clean" || prIsReadyToMerge

  const statusColor = merged ? prColors.merged
    : draft ? prColors.draft
    : hasChanges ? prColors.changesRequested
    : readyToMerge ? prColors.readyToMerge
    : prColors.inReview

  const statusLabel = merged ? "Merged"
    : draft ? "Draft"
    : hasChanges ? "Changes requested"
    : readyToMerge ? "Ready to merge"
    : "In review"

  const isReviewOutdated = !!(review.reviewHeadSha && prDetails?.headSha && review.reviewHeadSha !== prDetails.headSha)

  // ── Render helpers ──────────────────────────────────────────────────────

  type ReviewListItem =
    | { kind: "review-msg"; msg: ChatMessage }
    | { kind: "chat-msg"; msg: ChatMessage }

  const reviewItems = useMemo<ReviewListItem[]>(() => {
    return review.messages.map((msg) => ({
      kind: msg.isReview ? "review-msg" as const : "chat-msg" as const,
      msg,
    }))
  }, [review.messages])

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 6,
        paddingBottom: 10,
        paddingHorizontal: 14,
        backgroundColor: c.card,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={20} color={c.fg} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
              {prTitle}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Text style={{ color: c.fgSub, fontSize: 11 }}>#{prNumber}</Text>
              {prAuthor ? <Text style={{ color: c.fgSub, fontSize: 11 }}>· {prAuthor}</Text> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
                <Text style={{ color: statusColor, fontSize: 11 }}>{statusLabel}</Text>
              </View>
            </View>
          </View>
          {prUrl ? (
            <Pressable onPress={() => Linking.openURL(prUrl)} style={{ padding: 4 }}>
              <Ionicons name="open-outline" size={18} color={c.link} />
            </Pressable>
          ) : null}
        </View>

        {/* Action buttons */}
        {!merged && (
          <View style={{ gap: 8, marginBottom: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={showSubmitOptions}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                  backgroundColor: c.fgBright,
                  borderRadius: 8, paddingVertical: 8,
                }}
              >
                <Ionicons name="send-outline" size={14} color={c.fgBrightFg} />
                <Text style={{ color: c.fgBrightFg, fontSize: 13, fontWeight: "600" }}>
                  Submit{queuedComments.length > 0 ? ` (${queuedComments.length})` : ""}
                </Text>
              </TouchableOpacity>
              {(readyToMerge || (!draft && !merged)) && (
                <TouchableOpacity
                  onPress={showMergeOptions}
                  disabled={merging}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                    backgroundColor: readyToMerge ? c.success : c.secondary,
                    borderRadius: 8, paddingVertical: 8,
                  }}
                >
                  <Ionicons name="git-merge-outline" size={14} color={readyToMerge ? "#fff" : c.fgSub} />
                  <Text style={{ color: readyToMerge ? "#fff" : c.fgSub, fontSize: 13, fontWeight: "600" }}>
                    {merging ? "Merging…" : "Merge"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Secondary actions */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {draft && (
                <TouchableOpacity
                  onPress={handleMarkReady}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                    backgroundColor: c.secondary, borderRadius: 8, paddingVertical: 7,
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={14} color={c.fg} />
                  <Text style={{ color: c.fg, fontSize: 12, fontWeight: "500" }}>Mark ready</Text>
                </TouchableOpacity>
              )}
              {hasChanges && (
                <TouchableOpacity
                  onPress={handleRerequestReview}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                    backgroundColor: c.secondary, borderRadius: 8, paddingVertical: 7,
                  }}
                >
                  <Ionicons name="refresh-outline" size={14} color={c.fg} />
                  <Text style={{ color: c.fg, fontSize: 12, fontWeight: "500" }}>Re-request review</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Tab bar */}
        <View style={{ flexDirection: "row", gap: 4 }}>
          {(["review", "changes", "conversations"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: "center",
                backgroundColor: activeTab === tab ? c.secondary : "transparent",
              }}
            >
              <Text style={{
                color: activeTab === tab ? c.fg : c.fgSub,
                fontSize: 12, fontWeight: activeTab === tab ? "600" : "400",
                textTransform: "capitalize",
              }}>
                {tab === "changes" ? `Files (${prFiles.length})` : tab}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Review tab ──────────────────────────────────────────────────── */}
      {activeTab === "review" && (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={reviewItems}
            keyExtractor={(item) => item.msg.id}
            renderItem={({ item }) => {
              if (item.kind === "review-msg") {
                return (
                  <View style={{ padding: 16 }}>
                    {item.msg.content && (
                      <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, marginBottom: item.msg.comments?.length ? 12 : 0 }}>
                        <Markdown content={item.msg.content} />
                      </View>
                    )}
                    {item.msg.comments?.map((comment: ReviewComment) => {
                      const isQueued = comment.status === "queued"
                      return (
                        <ReviewCommentCard
                          key={comment.id}
                          comment={comment}
                          onDismiss={(id) => review.updateCommentStatus(id, comment.status === "dismissed" ? "pending" : "dismissed")}
                          onQueue={(c) => review.updateCommentStatus(c.id, isQueued ? "pending" : "queued")}
                          isQueued={isQueued}
                        />
                      )
                    })}
                  </View>
                )
              }
              return <ChatBubble message={item.msg} />
            }}
            contentContainerStyle={{ paddingBottom: 16 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListHeaderComponent={isReviewOutdated && review.hasReviewed ? (
              <View style={{ marginHorizontal: 16, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(234, 179, 8, 0.1)", borderWidth: 1, borderColor: "rgba(234, 179, 8, 0.3)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Ionicons name="warning-outline" size={14} color="#eab308" />
                <Text style={{ color: "#eab308", fontSize: 12, flex: 1 }}>New commits pushed since this review — results may be out of date.</Text>
              </View>
            ) : null}
            ListEmptyComponent={
              !review.loaded ? (
                <View style={{ padding: 32, alignItems: "center" }}>
                  <ActivityIndicator color={c.fgSub} />
                </View>
              ) : (
                <View style={{ padding: 32, alignItems: "center" }}>
                  <Ionicons name="eye-outline" size={32} color={c.fgSub} style={{ marginBottom: 12 }} />
                  <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>
                    Tap "Review" below to start an AI code review
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              (review.reviewing || review.isSending) ? (
                <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color="#f59e0b" />
                  <Text style={{ color: c.fgSub, fontSize: 12 }}>
                    {review.reviewing ? "Reviewing…" : "Thinking…"}
                  </Text>
                </View>
              ) : null
            }
          />

          {/* Input */}
          <View style={{
            borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card,
            paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 8,
          }}>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => review.triggerReview()}
                disabled={review.reviewing}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
                  backgroundColor: c.secondary,
                  opacity: review.reviewing ? 0.5 : 1,
                }}
              >
                <Ionicons name="refresh-outline" size={14} color={c.fgSub} />
                <Text style={{ color: c.fgSub, fontSize: 12 }}>{review.hasReviewed ? "Re-review" : "Review"}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask about this PR…"
                placeholderTextColor={c.placeholder}
                multiline
                style={{
                  flex: 1, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 8, color: c.fg, fontSize: 13, maxHeight: 100,
                }}
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!chatInput.trim() || review.isSending}
                style={{
                  width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
                  backgroundColor: chatInput.trim() && !review.isSending ? c.fgBright : c.secondary,
                  alignSelf: "flex-end",
                }}
              >
                <Ionicons name="send" size={16} color={chatInput.trim() && !review.isSending ? c.fgBrightFg : c.fgSub} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Changes tab ─────────────────────────────────────────────────── */}
      {activeTab === "changes" && (
        <View style={{ flex: 1 }}>
          {/* Toolbar */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.fgSub, fontSize: 12 }}>
              {viewedFiles.size}/{prFiles.length} viewed
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => {
                const allViewed = prFiles.every((f) => viewedFiles.has(f.path))
                const next = allViewed ? new Set<string>() : new Set(prFiles.map((f) => f.path))
                setViewedFiles(next)
                getStorage().setItem(viewedKey, JSON.stringify(Array.from(next)))
              }}
            >
              <Text style={{ color: c.link, fontSize: 12 }}>
                {prFiles.every((f) => viewedFiles.has(f.path)) ? "Unmark all" : "Mark all viewed"}
              </Text>
            </Pressable>
          </View>

          {loadingFiles && prFiles.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={c.fgSub} />
            </View>
          ) : (
            <FlatList
              data={prFiles}
              keyExtractor={(f) => f.path}
              renderItem={({ item: file }) => (
                <FileRow
                  file={file}
                  viewed={viewedFiles.has(file.path)}
                  onPress={() => {
                    if (file.patch) {
                      router.push({
                        pathname: "/pr-diff",
                        params: { path: file.path, patch: encodeURIComponent(file.patch) },
                      })
                    }
                  }}
                  onLongPress={() => toggleViewed(file.path)}
                />
              )}
              contentContainerStyle={{ paddingBottom: 32 }}
              ListEmptyComponent={
                <View style={{ padding: 32, alignItems: "center" }}>
                  <Text style={{ color: c.fgSub, fontSize: 14 }}>No files changed</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* ── Conversations tab ────────────────────────────────────────────── */}
      {activeTab === "conversations" && (
        <FlatList
          data={[
            ...(prBody ? [{ kind: "description" as const, item: null }] : []),
            ...(prDetails?.threads.filter((t) => !t.isResolved && t.comments.length > 0) ?? []).map((t) => ({ kind: "thread" as const, item: t })),
            ...(prDetails?.issueComments ?? []).map((c) => ({ kind: "comment" as const, item: c })),
          ]}
          keyExtractor={(item) => item.kind === "description" ? "pr-description" : item.kind === "thread" ? item.item.id : String(item.item.id)}
          renderItem={({ item }) => {
            if (item.kind === "description") {
              return (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: c.fgSub, fontSize: 9, fontWeight: "700" }}>{prAuthor[0]?.toUpperCase()}</Text>
                      </View>
                      <Text style={{ color: c.fgBright, fontSize: 12, fontWeight: "600" }}>{prAuthor}</Text>
                      <Text style={{ color: c.fgSub, fontSize: 10 }}>description</Text>
                    </View>
                    <View style={{ paddingLeft: 26 }}>
                      <Markdown content={prBody} />
                    </View>
                  </View>
                </View>
              )
            }
            if (item.kind === "thread") {
              return (
                <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                  <ThreadCard
                    thread={item.item}
                    repoId={repoId}
                    prNumber={prNumber}
                    onUpdated={() => queryClient.invalidateQueries({ queryKey: ["pr-details-repo", repoId, prNumber] })}
                  />
                </View>
              )
            }
            return (
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                <IssueCommentCard comment={item.item} />
              </View>
            )
          }}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            loadingDetails ? (
              <View style={{ padding: 32, alignItems: "center" }}>
                <ActivityIndicator color={c.fgSub} />
              </View>
            ) : (
              <View style={{ padding: 32, alignItems: "center" }}>
                <Ionicons name="chatbubbles-outline" size={32} color={c.fgSub} style={{ marginBottom: 12 }} />
                <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>No conversations yet</Text>
              </View>
            )
          }
        />
      )}

      {/* Submit closing overlay */}
      {submitClosing && (
        <RNAnimated.View style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.85)",
          alignItems: "center", justifyContent: "center",
          opacity: closingOpacity,
        }}>
          <RNAnimated.View style={{
            transform: [{ scale: closingScale }],
            alignItems: "center",
          }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: "rgba(52,211,153,0.15)",
              borderWidth: 2, borderColor: "rgba(52,211,153,0.4)",
              alignItems: "center", justifyContent: "center",
            }}>
              <RNAnimated.View style={{ transform: [{ scale: closingCheckScale }] }}>
                <Ionicons name="checkmark" size={36} color="#34d399" />
              </RNAnimated.View>
            </View>
            <Text style={{ color: "#34d399", fontSize: 15, fontWeight: "600", marginTop: 16 }}>
              Review submitted
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>
              #{prNumber}
            </Text>
          </RNAnimated.View>
        </RNAnimated.View>
      )}
    </KeyboardAvoidingView>
  )
}
