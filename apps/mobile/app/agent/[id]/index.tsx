import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, ActionSheetIOS, Alert,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useRef, useState, useEffect, useMemo, memo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgent, api, type Message, type Agent, type AgentSummary, type ToolCall } from "@hive/shared"
import { c } from "../../../theme"

const MODELS = [
  { id: "claude-sonnet-4-6",        label: "Sonnet 4.6" },
  { id: "claude-opus-4-6",          label: "Opus 4.6"   },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
]

function shortModel(modelId: string) {
  return MODELS.find((m) => m.id === modelId)?.label ?? modelId.split("-").slice(-2).join(" ")
}

// ── Markdown-ish renderer ─────────────────────────────────────────────────────

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <Text style={{ color: c.fgBright, fontSize: 14, lineHeight: 21 }}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text key={i} style={{ fontFamily: "monospace", backgroundColor: c.secondary, color: "#a78bfa", fontSize: 13 }}>
              {" "}{part.slice(1, -1)}{" "}
            </Text>
          )
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={i} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text>
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <Text key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>
        }
        return <Text key={i}>{part}</Text>
      })}
    </Text>
  )
}

function MessageContent({ text }: { text: string }) {
  const segments = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g)
  return (
    <View style={{ gap: 4 }}>
      {segments.map((seg, i) => {
        if (seg.startsWith("```")) {
          const firstNewline = seg.indexOf("\n")
          const lang = firstNewline > 3 ? seg.slice(3, firstNewline).trim() : ""
          const code = firstNewline > 0 ? seg.slice(firstNewline + 1, -3) : seg.slice(3, -3)
          return (
            <View key={i} style={{ backgroundColor: c.card, borderRadius: 8, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              {lang ? (
                <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 }}>
                  <Text style={{ color: c.fgSub, fontSize: 10, fontFamily: "monospace" }}>{lang}</Text>
                </View>
              ) : null}
              <Text style={{ color: c.fgBright, fontSize: 12, fontFamily: "monospace", lineHeight: 19, padding: 12 }}>
                {code.replace(/\n$/, "")}
              </Text>
            </View>
          )
        }
        // Parse block-level elements
        const lines = seg.split("\n")
        const elements: React.ReactNode[] = []
        let listItems: string[] = []
        let listOrdered = false

        function flushList() {
          if (listItems.length === 0) return
          elements.push(
            <View key={`list-${elements.length}`} style={{ gap: 2, paddingLeft: 4 }}>
              {listItems.map((item, li) => (
                <View key={li} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                  <Text style={{ color: c.fgSub, fontSize: 14, lineHeight: 21, minWidth: 14 }}>
                    {listOrdered ? `${li + 1}.` : "•"}
                  </Text>
                  <InlineText text={item} />
                </View>
              ))}
            </View>
          )
          listItems = []
        }

        for (let li = 0; li < lines.length; li++) {
          const line = lines[li]
          if (!line.trim()) {
            flushList()
            continue
          }
          const h1 = line.match(/^# (.+)/)
          const h2 = line.match(/^## (.+)/)
          const h3 = line.match(/^### (.+)/)
          const ul = line.match(/^[-*] (.+)/)
          const ol = line.match(/^\d+\. (.+)/)
          const blockquote = line.match(/^> (.+)/)
          const hr = line.match(/^---+$/)
          if (h1) {
            flushList()
            elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 18, fontWeight: "700", lineHeight: 26, marginTop: 4 }}>{h1[1]}</Text>)
          } else if (h2) {
            flushList()
            elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 16, fontWeight: "700", lineHeight: 24, marginTop: 4 }}>{h2[1]}</Text>)
          } else if (h3) {
            flushList()
            elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 14, fontWeight: "700", lineHeight: 22 }}>{h3[1]}</Text>)
          } else if (ul) {
            if (listOrdered) { flushList(); listOrdered = false }
            listItems.push(ul[1])
          } else if (ol) {
            if (!listOrdered) { flushList(); listOrdered = true }
            listItems.push(ol[1])
          } else if (blockquote) {
            flushList()
            elements.push(
              <View key={li} style={{ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 10, opacity: 0.7 }}>
                <InlineText text={blockquote[1]} />
              </View>
            )
          } else if (hr) {
            flushList()
            elements.push(<View key={li} style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />)
          } else {
            flushList()
            elements.push(<InlineText key={li} text={line} />)
          }
        }
        flushList()
        return elements.length > 0 ? <View key={i} style={{ gap: 3 }}>{elements}</View> : null
      })}
    </View>
  )
}

// ── Tool calls ────────────────────────────────────────────────────────────────

function ToolCallRow({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const isDone = call.result != null
  const name = call.tool === "Agent"
    ? (() => { try { return JSON.parse(call.args ?? "{}").description ?? call.tool } catch { return call.tool } })()
    : call.tool

  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.7}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 3 }}
    >
      <Text style={{ color: isDone ? "#34d399" : "#f59e0b", fontSize: 10, marginTop: 3 }}>
        {isDone ? "✓" : "○"}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace" }}>{name}</Text>
        {expanded && call.args && call.tool !== "Agent" && (
          <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", opacity: 0.6, marginTop: 2 }} numberOfLines={3}>
            {(() => { try { return JSON.stringify(JSON.parse(call.args), null, 2) } catch { return call.args } })()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ── Thinking block ────────────────────────────────────────────────────────────

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = thinking.slice(0, 120).replace(/\n/g, " ")
  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.8}
      style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, marginBottom: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ color: "#a78bfa", fontSize: 11 }}>✦</Text>
        <Text style={{ color: "#a78bfa", fontSize: 11, fontWeight: "600", flex: 1 }}>Thinking</Text>
        <Text style={{ color: c.fgSub, fontSize: 10 }}>{expanded ? "▲" : "▼"}</Text>
      </View>
      {expanded ? (
        <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 18, marginTop: 6, fontStyle: "italic" }}>
          {thinking}
        </Text>
      ) : (
        <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 18, marginTop: 4, fontStyle: "italic" }} numberOfLines={2}>
          {preview}{thinking.length > 120 ? "…" : ""}
        </Text>
      )}
    </TouchableOpacity>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  const toolCalls = message.toolCalls ?? []
  const hasContent = !!message.content

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: isUser ? "flex-end" : "flex-start" }}>
      {isUser ? (
        <View style={{ backgroundColor: c.secondary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "80%" }}>
          <Text style={{ color: c.fg, fontSize: 14, lineHeight: 20 }}>{message.content}</Text>
        </View>
      ) : (
        <View style={{ maxWidth: "94%" }}>
          {/* Thinking block */}
          {message.thinking ? <ThinkingBlock thinking={message.thinking} /> : null}

          {/* Tool calls */}
          {toolCalls.length > 0 && (
            <View style={{ marginBottom: hasContent ? 8 : 0, gap: 2 }}>
              {toolCalls.map((tc) => <ToolCallRow key={tc.id} call={tc} />)}
            </View>
          )}

          {/* Content */}
          {hasContent ? (
            <MessageContent text={message.content} />
          ) : toolCalls.length === 0 ? (
            <View style={{ flexDirection: "row", gap: 4, paddingVertical: 4 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.secondary }} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
})

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AgentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  // Active session — starts as the root agent, can switch to child sessions
  const [activeSessionId, setActiveSessionId] = useState<string | null>(id ?? null)
  const [creatingSession, setCreatingSession] = useState(false)

  // Reset active session when navigating to a different agent
  useEffect(() => { setActiveSessionId(id ?? null) }, [id])

  // Fetch child sessions for this agent
  const { data: sessions = [], refetch: refetchSessions } = useQuery<AgentSummary[]>({
    queryKey: ["agent-sessions", id],
    queryFn: () => api.getAgentSessions(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  const { data: agent, isLoading, isError, refetch, isStreaming } = useAgent(activeSessionId)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const listRef = useRef<FlatList>(null)
  const isNearBottom = useRef(true)

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

  function scrollToBottom(animated = true) {
    listRef.current?.scrollToEnd({ animated })
    setShowScrollBtn(false)
    isNearBottom.current = true
  }

  function handleScroll(event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height
    const near = distanceFromBottom < 100
    isNearBottom.current = near
    setShowScrollBtn(!near)
  }

  // Auto-scroll when a new message arrives — only if user is near the bottom
  useEffect(() => {
    if (messages.length > 0 && isNearBottom.current) {
      setTimeout(() => scrollToBottom(true), 50)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  // Auto-scroll when streaming ends and user is near bottom
  useEffect(() => {
    if (!isStreaming && isNearBottom.current) {
      setTimeout(() => scrollToBottom(true), 50)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  // Auto-send queued message when streaming ends
  useEffect(() => {
    if (!isStreaming && queuedMessage !== null) {
      const msg = queuedMessage
      setQueuedMessage(null)
      doSend(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  async function createSession() {
    if (!agent || creatingSession) return
    setCreatingSession(true)
    try {
      const created = await api.createAgent({
        title: "Untitled",
        branch: agent.branch,
        model: agent.model,
        shareWorktreeWith: id!,  // always share with root agent
      })
      queryClient.setQueryData(["agent", created.id], {
        ...created,
        messages: created.messages ?? [],
        fileChanges: created.fileChanges ?? [],
        terminalOutput: created.terminalOutput ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ["agent-sessions", id] })
      setActiveSessionId(created.id)
    } catch {
      Alert.alert("Error", "Failed to create session")
    } finally {
      setCreatingSession(false)
    }
  }

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
              queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, model } : old)
            }
          },
        })),
        { text: "Cancel", style: "cancel" },
      ])
    }
  }

  async function doSend(content: string) {
    if (!activeSessionId || !content.trim()) return
    setSending(true)
    const optimisticId = `optimistic-${Date.now()}`
    queryClient.setQueryData<Agent>(["agent", activeSessionId], (old) => {
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
      await api.sendMessage(activeSessionId, content)
    } catch {
      queryClient.setQueryData<Agent>(["agent", activeSessionId], (old) => {
        if (!old) return old
        return { ...old, messages: old.messages.filter((m) => m.id !== optimisticId) }
      })
    } finally {
      setSending(false)
    }
  }

  function handleSend() {
    const content = input.trim()
    if (!content || !activeSessionId || sending) return
    setInput("")
    // Always scroll to bottom when user sends — they want to see the response
    isNearBottom.current = true
    scrollToBottom(true)
    if (isStreaming) {
      setQueuedMessage(content)
      return
    }
    doSend(content)
  }

  if (isError && !agent) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Text style={{ color: c.fgSub, fontSize: 14 }}>Could not load agent</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: c.secondary }}
        >
          <Text style={{ color: c.fg, fontSize: 14 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
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
      {/* Sessions strip — shown when there are (or could be) multiple sessions */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 4, paddingVertical: 6, flexDirection: "row" }}>
          {/* Root session tab */}
          <TouchableOpacity
            onPress={() => setActiveSessionId(id ?? null)}
            style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
              backgroundColor: activeSessionId === id ? c.secondary : "transparent",
            }}
          >
            <Text style={{ color: activeSessionId === id ? c.fg : c.fgSub, fontSize: 12, fontWeight: "500" }}>
              {agent?.title ?? "Session 1"}
            </Text>
          </TouchableOpacity>
          {/* Child session tabs */}
          {sessions.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => {
                // Pre-fill cache if not already there
                queryClient.setQueryData(["agent", s.id], (old: Agent | undefined) =>
                  old ?? { ...s, messages: [], fileChanges: [], terminalOutput: [] }
                )
                setActiveSessionId(s.id)
              }}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                backgroundColor: activeSessionId === s.id ? c.secondary : "transparent",
              }}
            >
              <Text style={{ color: activeSessionId === s.id ? c.fg : c.fgSub, fontSize: 12, fontWeight: "500" }}>
                {s.title === "Untitled" ? `Session ${i + 2}` : s.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* New session button */}
        <TouchableOpacity
          onPress={createSession}
          disabled={creatingSession}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          {creatingSession
            ? <ActivityIndicator size="small" color={c.fgSub} />
            : <Text style={{ color: c.fgSub, fontSize: 18, lineHeight: 20 }}>+</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Sub-nav */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16, gap: 4, paddingTop: 4 }}>
        {[
          { label: "Chat", route: null },
          { label: `Files${agent.fileChanges.length ? ` (${agent.fileChanges.length})` : ""}`, route: "files" },
          { label: "PR", route: "pr" },
        ].map(({ label, route }) => (
          <TouchableOpacity
            key={label}
            onPress={() => route ? router.push(`/agent/${activeSessionId ?? id}/${route}`) : undefined}
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
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
              <Text style={{ color: c.fgSub, fontSize: 14 }}>Start the conversation</Text>
            </View>
          }
        />
        {showScrollBtn && (
          <TouchableOpacity
            onPress={() => scrollToBottom(true)}
            style={{
              position: "absolute", bottom: 12, alignSelf: "center",
              backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
              flexDirection: "row", alignItems: "center", gap: 5,
            }}
          >
            <Text style={{ color: c.fgSub, fontSize: 12 }}>↓</Text>
            <Text style={{ color: c.fgSub, fontSize: 12 }}>Scroll to bottom</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Input bar */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 + insets.bottom }}>
        {/* Queued message preview */}
        {queuedMessage && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ color: c.fgSub, fontSize: 11, flex: 1 }} numberOfLines={1}>
              ⏱ Queued: {queuedMessage}
            </Text>
            <TouchableOpacity onPress={() => setQueuedMessage(null)}>
              <Text style={{ color: c.fgSub, fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={isStreaming ? (queuedMessage ? "Replace queued message…" : "Queue a follow-up…") : messages.length === 0 ? "Tell the agent what to work on…" : "Add a follow up"}
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
          {/* Bottom toolbar */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
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

            {/* Stop / send */}
            {isStreaming && !queuedMessage ? (
              <TouchableOpacity
                onPress={() => api.stopAgent(activeSessionId!).catch(() => {})}
                style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>■</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSend}
                disabled={!input.trim() || sending}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  backgroundColor: input.trim() && !sending ? c.fgBright : c.secondary,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                {sending
                  ? <ActivityIndicator size="small" color={c.fgSub} />
                  : <Text style={{ color: input.trim() ? c.bg : c.fgSub, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>↑</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
