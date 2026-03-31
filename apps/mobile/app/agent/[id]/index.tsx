import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Pressable,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useRef, useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAgent, api, type Message, type Agent } from "@hive/shared"
import { c } from "../../../theme"

function SimpleMarkdown({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <Text style={[{ color: c.fgBright, fontSize: 14, lineHeight: 21 }, style]}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text key={i} style={{ fontFamily: "monospace", backgroundColor: c.secondary, color: "#a78bfa", fontSize: 13 }}>
              {part.slice(1, -1)}
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  const toolCount = message.toolCalls?.length ?? 0

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: isUser ? "flex-end" : "flex-start" }}>
      {isUser ? (
        <View style={{ backgroundColor: c.primaryDark, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "80%" }}>
          <Text style={{ color: c.white, fontSize: 14, lineHeight: 20 }}>{message.content}</Text>
        </View>
      ) : (
        <View style={{ maxWidth: "92%" }}>
          {toolCount > 0 && (
            <Text style={{ color: c.fgSub, fontSize: 11, marginBottom: 4 }}>
              {toolCount} tool call{toolCount !== 1 ? "s" : ""}
            </Text>
          )}
          {message.content ? (
            <SimpleMarkdown text={message.content} />
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
}

export default function AgentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: agent, isLoading, isStreaming } = useAgent(id ?? null)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList>(null)

  const messages = agent?.messages ?? []

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages.length])

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
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: route === null ? 2 : 0, borderBottomColor: c.primary }}
          >
            <Text style={{ color: route === null ? c.fg : c.fgSub, fontSize: 13, fontWeight: route === null ? "600" : "400" }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}

        {isStreaming && (
          <View style={{ marginLeft: "auto", alignSelf: "center" }}>
            <ActivityIndicator size="small" color={c.link} />
          </View>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Text style={{ color: c.fgSub, fontSize: 14 }}>Start the conversation</Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 10, gap: 8, backgroundColor: c.bg }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Message..."
          placeholderTextColor={c.placeholder}
          multiline
          style={{
            flex: 1,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            color: c.fg,
            fontSize: 14,
            maxHeight: 120,
          }}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!input.trim() || sending}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: input.trim() ? c.primary : c.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: input.trim() ? c.white : c.placeholder, fontSize: 16 }}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
