import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, ActionSheetIOS, Alert,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useRef, useState, useEffect, useMemo, memo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgent, api, type Message, type Agent } from "@hive/shared"
import { c } from "../../../theme"

const MODELS = [
  { id: "claude-sonnet-4-6",        label: "Sonnet 4.6" },
  { id: "claude-opus-4-6",          label: "Opus 4.6"   },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
]

function shortModel(modelId: string) {
  return MODELS.find((m) => m.id === modelId)?.label ?? modelId.split("-").slice(-2).join(" ")
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*)/g)
  return (
    <Text style={{ color: c.fgBright, fontSize: 14, lineHeight: 21 }}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text key={i} style={{ fontFamily: "monospace", backgroundColor: c.secondary, color: "#a78bfa", fontSize: 13, borderRadius: 3 }}>
              {" "}{part.slice(1, -1)}{" "}
            </Text>
          )
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={i} style={{ fontWeight: "700", color: c.fg }}>{part.slice(2, -2)}</Text>
        }
        return <Text key={i}>{part}</Text>
      })}
    </Text>
  )
}

function MessageContent({ text }: { text: string }) {
  // Split on fenced code blocks, preserving the delimiter
  const segments = text.split(/(```[\s\S]*?```)/g)

  return (
    <View style={{ gap: 4 }}>
      {segments.map((seg, i) => {
        if (seg.startsWith("```")) {
          const inner = seg.slice(3, -3)  // strip opening/closing ```
          const newline = inner.indexOf("\n")
          const lang = newline !== -1 ? inner.slice(0, newline).trim() : ""
          const code = newline !== -1 ? inner.slice(newline + 1) : inner
          return (
            <View key={i} style={{ backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: "hidden", marginVertical: 4 }}>
              {lang ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace" }}>{lang}</Text>
                </View>
              ) : null}
              <Text style={{ color: c.fgBright, fontSize: 12, fontFamily: "monospace", lineHeight: 19, padding: 12 }}>
                {code.replace(/\n$/, "")}
              </Text>
            </View>
          )
        }
        if (!seg.trim()) return null
        return <InlineText key={i} text={seg} />
      })}
    </View>
  )
}

const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  const toolCount = message.toolCalls?.length ?? 0

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: isUser ? "flex-end" : "flex-start" }}>
      {isUser ? (
        <View style={{ backgroundColor: c.secondary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "80%" }}>
          <Text style={{ color: c.fg, fontSize: 14, lineHeight: 20 }}>{message.content}</Text>
        </View>
      ) : (
        <View style={{ maxWidth: "92%" }}>
          {toolCount > 0 && (
            <Text style={{ color: c.fgSub, fontSize: 11, marginBottom: 4 }}>
              {toolCount} tool call{toolCount !== 1 ? "s" : ""}
            </Text>
          )}
          {message.content ? (
            <MessageContent text={message.content} />
          ) : toolCount > 0 ? null : (
            <View style={{ flexDirection: "row", gap: 4, paddingVertical: 4 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.secondary }} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  )
})

export default function AgentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { data: agent, isLoading, isStreaming } = useAgent(id ?? null)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList>(null)

  // Deduplicate by ID — prevents FlatList key errors when setQueryData (streaming)
  // and invalidateQueries (refetch) briefly produce the same ID twice
  const messages = useMemo(() => {
    const seen = new Set<string>()
    return (agent?.messages ?? []).filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }, [agent?.messages])

  // Scroll to bottom when a new message is added (not during streaming content updates)
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    }
  }, [messages.length])

  // Scroll to bottom when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    }
  }, [isStreaming])

  function handleModelPress() {
    const options = [...MODELS.map((m) => m.label), "Cancel"]
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, title: "Select model" },
        (idx) => {
          if (idx < MODELS.length && agent) {
            const model = MODELS[idx].id
            ;(api.updateAgent as any)(agent.id, { model })
            queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, model } : old)
          }
        }
      )
    } else {
      Alert.alert("Select model", undefined, [
        ...MODELS.map((m) => ({
          text: m.label,
          onPress: () => {
            if (agent) {
              ;(api.updateAgent as any)(agent.id, { model: m.id })
              queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, model: m.id } : old)
            }
          },
        })),
        { text: "Cancel", style: "cancel" },
      ])
    }
  }

  async function handleSend() {
    if (!input.trim() || !id || sending) return
    const content = input.trim()
    setInput("")
    setSending(true)

    const optimisticId = `optimistic-${Date.now()}`
    queryClient.setQueryData<Agent>(["agent", id], (old) => {
      if (!old) return old
      return {
        ...old,
        messages: [
          ...old.messages,
          { id: optimisticId, role: "user", content, timestamp: new Date().toISOString() },
        ],
      }
    })

    try {
      await api.sendMessage(id, content)
    } finally {
      setSending(false)
    }
  }

  if (isLoading || !agent) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Sub-nav */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16, gap: 4, paddingTop: 4 }}>
        {[
          { label: "Chat", route: null },
          { label: `Files${agent.fileChanges.length ? ` (${agent.fileChanges.length})` : ""}`, route: "files" },
          { label: "PR", route: "pr" },
        ].map(({ label, route }) => (
          <TouchableOpacity
            key={label}
            onPress={() => route ? router.push(`/agent/${id}/${route}`) : undefined}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: route === null ? 2 : 0, borderBottomColor: c.fg }}
          >
            <Text style={{ color: route === null ? c.fg : c.fgSub, fontSize: 13, fontWeight: route === null ? "600" : "400" }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={{ flex: 1 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Text style={{ color: c.fgSub, fontSize: 14 }}>Start the conversation</Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 + insets.bottom }}>
        <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={messages.length === 0 ? "Tell the agent what to work on…" : "Add a follow up"}
            placeholderTextColor={c.placeholder}
            multiline
            style={{
              color: c.fg,
              fontSize: 14,
              lineHeight: 20,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 8,
              maxHeight: 120,
            }}
          />
          {/* Bottom toolbar — mirrors web: left=file+model, right=send */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
            {/* File attachment */}
            <TouchableOpacity
              onPress={() => Alert.alert("Attachments", "File uploads coming soon.")}
              style={{ width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: c.fgSub, fontSize: 16 }}>⊕</Text>
            </TouchableOpacity>

            {/* Model selector */}
            <TouchableOpacity
              onPress={handleModelPress}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
            >
              <Text style={{ color: c.fgSub, fontSize: 11 }}>✦</Text>
              <Text style={{ color: c.fgSub, fontSize: 12, fontWeight: "500" }}>{shortModel(agent.model)}</Text>
              <Text style={{ color: c.placeholder, fontSize: 9 }}>▾</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {/* Send */}
            <TouchableOpacity
              onPress={handleSend}
              disabled={!input.trim() || sending}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: input.trim() ? c.fgBright : c.secondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: input.trim() ? c.bg : c.fgSub, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
