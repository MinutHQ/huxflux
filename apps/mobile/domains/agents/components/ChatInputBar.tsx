import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, queryKeys, type Agent } from "@huxflux/shared"
import { useQueryClient } from "@tanstack/react-query"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { MODELS, shortModel } from "../utils"
import type { Attachment } from "../agents.types"

function QueuedMessagePreview({ queuedMessage, onClear }: { queuedMessage: string; onClear: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
      <Ionicons name="time-outline" size={12} color={c.fgSub} />
      <Text style={{ color: c.fgSub, fontSize: 11, flex: 1 }} numberOfLines={1}>
        Queued: {queuedMessage}
      </Text>
      <TouchableOpacity onPress={onClear}>
        <Ionicons name="close" size={14} color={c.fgSub} />
      </TouchableOpacity>
    </View>
  )
}

function AttachmentStrip({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (path: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
      {attachments.map((f) => (
        <View key={f.path} style={{ position: "relative" }}>
          {f.mimeType.startsWith("image/") ? (
            <Image source={{ uri: f.localUri }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.card }} />
          ) : (
            <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-outline" size={24} color={c.fgSub} />
            </View>
          )}
          <TouchableOpacity
            onPress={() => onRemove(f.path)}
            style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: c.fg, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="close" size={11} color={c.bg} />
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  )
}

function ToolbarToggle({ active, onPress, icon, label }: {
  active: boolean
  onPress: () => void
  icon: keyof typeof Ionicons.glyphMap
  label: string
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
        backgroundColor: active ? c.secondary : "transparent",
      }}
    >
      <Ionicons name={icon} size={13} color={active ? "#fff" : c.fgSub} />
      <Text style={{ color: active ? "#fff" : c.fgSub, fontSize: 11, fontWeight: "500" }}>{label}</Text>
    </TouchableOpacity>
  )
}

function SendOrStopButton({ canSend, sending, isStreaming, queuedMessage, activeSessionId, onSend }: {
  canSend: boolean
  sending: boolean
  isStreaming: boolean
  queuedMessage: string | null
  activeSessionId: string | null
  onSend: () => void
}) {
  if (isStreaming && !queuedMessage) {
    return (
      <TouchableOpacity
        onPress={() => api.agents.stop(activeSessionId!).catch(() => {})}
        style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>■</Text>
      </TouchableOpacity>
    )
  }
  return (
    <TouchableOpacity
      onPress={onSend}
      disabled={!canSend}
      style={{
        width: 28, height: 28, borderRadius: 6,
        backgroundColor: canSend ? c.fgBright : c.secondary,
        alignItems: "center", justifyContent: "center",
      }}
    >
      {sending
        ? <ActivityIndicator size="small" color={c.fgSub} />
        : <Text style={{ color: canSend ? c.bg : c.fgSub, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>↑</Text>
      }
    </TouchableOpacity>
  )
}

export function ChatInputBar({
  agent, activeSessionId,
  input, setInput,
  attachments, setAttachments,
  queuedMessage, setQueuedMessage,
  sending, thinking, setThinking, planMode, setPlanMode,
  isStreaming, hasMessages,
  onSend, onPickImage,
  bottomInset,
}: {
  agent: Agent
  activeSessionId: string | null
  input: string
  setInput: (s: string) => void
  attachments: Attachment[]
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>
  queuedMessage: string | null
  setQueuedMessage: (s: string | null) => void
  sending: boolean
  thinking: boolean
  setThinking: React.Dispatch<React.SetStateAction<boolean>>
  planMode: boolean
  setPlanMode: React.Dispatch<React.SetStateAction<boolean>>
  isStreaming: boolean
  hasMessages: boolean
  onSend: () => void
  onPickImage: () => void
  bottomInset: number
}) {
  const queryClient = useQueryClient()
  const modal = useModal()

  function handleModelPress() {
    modal.showActionSheet("Select model", MODELS.map((m) => ({
      label: m.label,
      onPress: () => {
        // `model` isn't part of `updateAgent`'s declared param shape but the
        // server accepts it. Cast preserved verbatim from the source.
        ;(api.agents.update as (id: string, patch: Record<string, unknown>) => Promise<unknown>)(agent.id, { model: m.id })
        queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => old ? { ...old, model: m.id } : old)
      },
    })))
  }

  const canSend = !!(input.trim() || attachments.length > 0) && !sending
  const placeholder = isStreaming
    ? (queuedMessage ? "Replace queued message…" : "Queue a follow-up…")
    : !hasMessages ? "Tell the agent what to work on…" : "Add a follow up"

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 + bottomInset }}>
      {queuedMessage && <QueuedMessagePreview queuedMessage={queuedMessage} onClear={() => setQueuedMessage(null)} />}
      {attachments.length > 0 && (
        <AttachmentStrip
          attachments={attachments}
          onRemove={(path) => setAttachments((prev) => prev.filter((a) => a.path !== path))}
        />
      )}

      <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          placeholderTextColor={c.placeholder}
          multiline
          style={{ color: c.fg, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, maxHeight: 120 }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
          <TouchableOpacity onPress={onPickImage} style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
            <Ionicons name="image-outline" size={16} color={c.fgSub} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleModelPress}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
          >
            <Text style={{ color: c.fgSub, fontSize: 11 }}>✦</Text>
            <Text style={{ color: c.fgSub, fontSize: 12, fontWeight: "500" }}>{shortModel(agent.model)}</Text>
            <Text style={{ color: c.placeholder, fontSize: 9 }}>▾</Text>
          </TouchableOpacity>

          <ToolbarToggle active={thinking} onPress={() => setThinking((v) => !v)} icon="bulb-outline" label="Thinking" />
          <ToolbarToggle active={planMode} onPress={() => setPlanMode((v) => !v)} icon="map-outline" label="Plan" />

          <View style={{ flex: 1 }} />

          <SendOrStopButton
            canSend={canSend}
            sending={sending}
            isStreaming={isStreaming}
            queuedMessage={queuedMessage}
            activeSessionId={activeSessionId}
            onSend={onSend}
          />
        </View>
      </View>
    </View>
  )
}
