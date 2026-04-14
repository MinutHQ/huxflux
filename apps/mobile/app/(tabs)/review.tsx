import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Pressable, Image } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getActiveServer, getStorage, useServerConfig } from "@huxflux/shared"
import { c } from "../../theme"
import { useState, useCallback, useMemo, useEffect } from "react"
import { useHydrated } from "../_layout"
import { useMobilePRs, type MobilePR } from "../../hooks/useMobilePRs"
import { useBulkReview } from "../../hooks/useBulkReview"
import { HIDE_REVIEWED_PRS_KEY } from "../../lib/prefs"

const COLLAPSED_REVIEW_SECTIONS_KEY = "huxflux:mobile:collapsed-review-sections"

// ── PR row ──────────────────────────────────────────────────────────────────

function PRRow({ pr, isReviewing }: { pr: MobilePR; isReviewing: boolean }) {
  const router = useRouter()

  const statusColor = pr.hasChangeRequests
    ? "#f59e0b"
    : pr.isReadyToMerge
    ? "#34d399"
    : pr.draft
    ? c.fgSub
    : "#60a5fa"

  const statusLabel = pr.hasChangeRequests
    ? "Changes requested"
    : pr.isReadyToMerge
    ? "Ready to merge"
    : pr.draft
    ? "Draft"
    : "Open"

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: "/pr-review", params: {
        repoId: pr.repoId,
        number: String(pr.number),
        title: pr.title,
        author: pr.author,
        url: pr.url,
        body: pr.body ?? "",
        draft: pr.draft ? "1" : "",
        hasChangeRequests: pr.hasChangeRequests ? "1" : "",
        isReadyToMerge: pr.isReadyToMerge ? "1" : "",
      } })}
      style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      {isReviewing && <ActivityIndicator size="small" color="#f59e0b" />}
      {pr.authorAvatar ? (
        <Image source={{ uri: pr.authorAvatar }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.secondary }} />
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="person" size={14} color={c.fgSub} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }} numberOfLines={1}>{pr.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
          <Text style={{ color: c.fgSub, fontSize: 12 }} numberOfLines={1}>{pr.repoName}</Text>
          <Text style={{ color: c.fgSub, fontSize: 11 }}>#{pr.number}</Text>
          <Text style={{ color: c.fgSub, fontSize: 11 }}>·</Text>
          <Text style={{ color: c.fgSub, fontSize: 11 }}>{pr.author}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: 11 }}>{statusLabel}</Text>
          </View>
          <Text style={{ color: c.success, fontSize: 11 }}>+{pr.additions}</Text>
          <Text style={{ color: c.error, fontSize: 11 }}>-{pr.deletions}</Text>
          <Text style={{ color: c.fgSub, fontSize: 10, marginLeft: "auto" }}>{pr.requestedAt}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={c.fgSub} />
    </TouchableOpacity>
  )
}

// ── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title, count, color, collapsed, onToggle }: { title: string; count: number; color: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{ paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={12} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {title}
      </Text>
      <Text style={{ color: c.placeholder, fontSize: 11, marginLeft: "auto" }}>{count}</Text>
    </Pressable>
  )
}

// ── Main screen ─────────────────────────────────────────────────────────────

type SectionKey = "reRequested" | "toReview" | "reviewed"

type ListItem =
  | { kind: "section"; key: SectionKey; title: string; count: number; color: string }
  | { kind: "pr"; pr: MobilePR }

export default function ReviewScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const hydrated = useHydrated()
  const { prs, sections, isLoading, refetch, githubEnabled } = useMobilePRs()
  const [refreshing, setRefreshing] = useState(false)
  const [hideReviewed, setHideReviewed] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set(["reviewed"]))

  const { reviewingIds, isBulkReviewing, startBulkReview, cancelBulkReview } = useBulkReview(() => {
    refetch()
  })

  // Hydrate prefs
  useEffect(() => {
    if (!hydrated) return
    const saved = getStorage().getItem(HIDE_REVIEWED_PRS_KEY)
    if (saved === "true") setHideReviewed(true)
    const savedCollapsed = getStorage().getItem(COLLAPSED_REVIEW_SECTIONS_KEY)
    if (savedCollapsed) {
      try { setCollapsed(new Set(JSON.parse(savedCollapsed) as SectionKey[])) } catch { /* ignore */ }
    }
  }, [hydrated])

  // Persist pref
  useEffect(() => {
    if (!hydrated) return
    getStorage().setItem(HIDE_REVIEWED_PRS_KEY, String(hideReviewed))
  }, [hydrated, hideReviewed])

  useEffect(() => {
    if (!hydrated) return
    getStorage().setItem(COLLAPSED_REVIEW_SECTIONS_KEY, JSON.stringify([...collapsed]))
  }, [hydrated, collapsed])

  const toggleCollapsed = useCallback((key: SectionKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const server = getActiveServer()

  async function onRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const items = useMemo(() => {
    const list: ListItem[] = []

    if (sections.reRequested.length > 0) {
      list.push({ kind: "section", key: "reRequested", title: "Re-requested", count: sections.reRequested.length, color: "#f59e0b" })
      if (!collapsed.has("reRequested")) {
        for (const pr of sections.reRequested) list.push({ kind: "pr", pr })
      }
    }

    if (sections.toReview.length > 0) {
      list.push({ kind: "section", key: "toReview", title: "To Review", count: sections.toReview.length, color: "#60a5fa" })
      if (!collapsed.has("toReview")) {
        for (const pr of sections.toReview) list.push({ kind: "pr", pr })
      }
    }

    if (!hideReviewed && sections.reviewed.length > 0) {
      list.push({ kind: "section", key: "reviewed", title: "Reviewed", count: sections.reviewed.length, color: c.fgSub })
      if (!collapsed.has("reviewed")) {
        for (const pr of sections.reviewed) list.push({ kind: "pr", pr })
      }
    }

    return list
  }, [sections, hideReviewed, collapsed])

  if (!hydrated || isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.fgSub} />
      </View>
    )
  }

  if (!server) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>No server connected</Text>
        <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center", marginBottom: 24 }}>Add a Huxflux server to get started</Text>
        <TouchableOpacity
          onPress={() => router.push("/servers")}
          style={{ backgroundColor: c.fgBright, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
        >
          <Text style={{ color: c.fgBrightFg, fontWeight: "600", fontSize: 14 }}>Add Server</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!githubEnabled) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{
          paddingTop: insets.top + 10,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}>
          <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", letterSpacing: -0.4 }}>Review</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Ionicons name="logo-github" size={32} color={c.fgSub} style={{ marginBottom: 12 }} />
          <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600", marginBottom: 6 }}>GitHub not configured</Text>
          <Text style={{ color: c.fgSub, fontSize: 13, textAlign: "center" }}>
            Enable GitHub integration on your server to review pull requests.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 10,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: c.card,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        gap: 10,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", letterSpacing: -0.4 }}>Pull Requests</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {/* Bulk review */}
            {isBulkReviewing ? (
              <Pressable
                onPress={cancelBulkReview}
                style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="stop-circle" size={20} color={c.error} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => startBulkReview(prs)}
                style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="play-circle-outline" size={20} color={c.fgSub} />
              </Pressable>
            )}
            {/* Refresh */}
            <Pressable
              onPress={onRefresh}
              style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="refresh-outline" size={18} color={c.fgSub} />
            </Pressable>
            {/* Filter */}
            <Pressable
              onPress={() => setHideReviewed((v) => !v)}
              style={{
                width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
                backgroundColor: hideReviewed ? c.secondary : "transparent",
              }}
            >
              <Ionicons name="filter-outline" size={16} color={hideReviewed ? c.fg : c.fgSub} />
            </Pressable>
          </View>
        </View>

        {isBulkReviewing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ActivityIndicator size="small" color="#f59e0b" />
            <Text style={{ color: c.fgSub, fontSize: 12 }}>
              Reviewing {reviewingIds.size} PR{reviewingIds.size !== 1 ? "s" : ""}...
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => {
          if (item.kind === "section") return `s-${item.key}`
          return item.pr.id
        }}
        renderItem={({ item }) => {
          if (item.kind === "section") {
            return (
              <SectionHeader
                title={item.title}
                count={item.count}
                color={item.color}
                collapsed={collapsed.has(item.key)}
                onToggle={() => toggleCollapsed(item.key)}
              />
            )
          }
          return <PRRow pr={item.pr} isReviewing={reviewingIds.has(item.pr.id)} />
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.fgSub} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Ionicons name="git-pull-request-outline" size={32} color={c.fgSub} style={{ marginBottom: 12 }} />
            <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>No open pull requests</Text>
          </View>
        }
      />
    </View>
  )
}
