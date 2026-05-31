import { View, Text, TouchableOpacity, ActivityIndicator, TextInput } from "react-native"
import { api, type PRThread, useHuxfluxMutation } from "@huxflux/shared"
import { useState } from "react"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { Markdown } from "@/domains/agents/Markdown"

export function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function ThreadCard({
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
  const rootComment = thread.comments[0]

  const replyMut = useHuxfluxMutation<unknown, string>({
    mutationFn: (body) => api.prs.replyToComment(repoId, prNumber, rootComment!.databaseId!, body),
    onSuccess: () => {
      setReplyText("")
      onUpdated()
    },
    onError: (e) => modal.showAlert("Error", e instanceof Error ? e.message : String(e)),
  })

  const resolveMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.resolveThread(thread.id),
    onSuccess: () => onUpdated(),
    onError: (e) => modal.showAlert("Error", e instanceof Error ? e.message : String(e)),
  })
  const sending = replyMut.isPending
  const resolving = resolveMut.isPending

  if (!rootComment) return null

  function handleReply() {
    if (!replyText.trim() || !rootComment?.databaseId) return
    replyMut.mutate(replyText.trim())
  }

  function handleResolve() {
    resolveMut.mutate()
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
          <View style={{ paddingLeft: 26 }}>
            <Markdown content={comment.body} />
          </View>
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
