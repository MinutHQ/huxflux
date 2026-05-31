import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native"
import { useRef, useEffect, useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { ReactNode } from "react"
import { c } from "@/theme"
import { AgentFilesScreen } from "./AgentFilesScreen"
import { SessionsStrip } from "../components/SessionsStrip"
import { AgentSubNav } from "../components/AgentSubNav"
import { MessageBubble } from "../components/MessageBubble"
import { TeamBar } from "../components/TeamBar"
import { TerminalPane } from "../components/TerminalPane"
import { ChatInputBar } from "../components/ChatInputBar"
import { useAgentChat } from "../hooks/useAgentChat"
import type { ChatTab } from "../agents.types"

/**
 * `prPaneSlot` lets the route render PR-related screens (still owned by future
 * pull-requests domain) without the agents domain importing from app/. The
 * route at app/agent/[id]/index.tsx passes the current PR pane element here.
 */
export function AgentDetailScreen({ agentId, prPaneSlot }: { agentId: string; prPaneSlot: ReactNode }) {
  const insets = useSafeAreaInsets()
  const chat = useAgentChat(agentId)
  const {
    activeSessionId, setActiveSessionId, sessions, creatingSession, createSession,
    agent, agentState, messages, teamAgents, isStreaming,
    input, setInput, sending,
    queuedMessage, setQueuedMessage,
    thinking, setThinking, planMode, setPlanMode,
    attachments, setAttachments,
    handleSend, pickImage,
  } = chat

  const { isLoading, isError, refetch, loadMore, hasMore, isLoadingMore } = agentState

  const [activeTab, setActiveTab] = useState<ChatTab>("chat")
  // Reset tab to chat when the agent changes. Syncing prop → state is the
  // canonical setState-in-effect case.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setActiveTab("chat") }, [agentId])

  const listRef = useRef<FlatList>(null)
  const isAtBottom = useRef(true)

  // Track streaming content length so we can auto-scroll during streaming
  const lastMessage = messages[messages.length - 1]
  const streamingContentLen = lastMessage?.content?.length ?? 0
  const streamingToolCallsLen = lastMessage?.toolCalls?.length ?? 0
  const streamingPendingLen = lastMessage?.pendingText?.length ?? 0

  useEffect(() => {
    if (messages.length > 0 && isAtBottom.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    }
  }, [messages.length, streamingContentLen, streamingToolCallsLen, streamingPendingLen, isStreaming])

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

  function onTabSelect(tab: ChatTab) {
    setActiveTab(tab)
    if (tab === "chat") setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top + (Platform.OS === "ios" ? 44 : 56)}
    >
      <SessionsStrip
        rootId={agentId}
        rootTitle={agent.title}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={createSession}
        creatingSession={creatingSession}
      />

      <AgentSubNav
        activeTab={activeTab}
        onSelect={onTabSelect}
        fileChangesCount={agent.fileChanges.length}
        messages={messages}
      />

      {activeTab === "chat" && (
        <>
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={messages}
            keyExtractor={(m) => m.id}
            extraData={isStreaming}
            renderItem={({ item, index }) => <MessageBubble message={item} isStreaming={isStreaming && index === messages.length - 1} />}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
            onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
              const dist = contentSize.height - contentOffset.y - layoutMeasurement.height
              isAtBottom.current = dist < 80
            }}
            scrollEventThrottle={100}
            ListHeaderComponent={hasMore ? (
              <TouchableOpacity
                onPress={loadMore}
                disabled={isLoadingMore}
                style={{ alignItems: "center", paddingVertical: 12 }}
              >
                {isLoadingMore
                  ? <ActivityIndicator size="small" color={c.fgSub} />
                  : <Text style={{ color: c.link, fontSize: 13 }}>Load earlier messages</Text>
                }
              </TouchableOpacity>
            ) : null}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                <Text style={{ color: c.fgSub, fontSize: 14 }}>Start the conversation</Text>
              </View>
            }
            ListFooterComponent={null}
          />
          {teamAgents.length > 1 && <TeamBar agents={teamAgents} isStreaming={isStreaming} />}
        </>
      )}
      {activeTab === "files" && <AgentFilesScreen agentId={agentId} />}
      {activeTab === "pr" && prPaneSlot}
      {activeTab === "terminal" && <TerminalPane agentId={agentId} />}

      {activeTab === "chat" && (
        <ChatInputBar
          agent={agent}
          activeSessionId={activeSessionId}
          input={input}
          setInput={setInput}
          attachments={attachments}
          setAttachments={setAttachments}
          queuedMessage={queuedMessage}
          setQueuedMessage={setQueuedMessage}
          sending={sending}
          thinking={thinking}
          setThinking={setThinking}
          planMode={planMode}
          setPlanMode={setPlanMode}
          isStreaming={!!isStreaming}
          hasMessages={messages.length > 0}
          onSend={handleSend}
          onPickImage={pickImage}
          bottomInset={insets.bottom}
        />
      )}
    </KeyboardAvoidingView>
  )
}
