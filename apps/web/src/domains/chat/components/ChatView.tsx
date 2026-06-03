import { useEffect, useRef, useState } from "react"
import { useAgents, useRepos } from "@huxflux/shared"
import type { AgentSummary, PRComment } from "@huxflux/shared"
import { CreationView } from "../views/CreationView"
import { ChatHeaderBar } from "./ChatHeaderBar"
import { ChatTabBar } from "./ChatTabBar"
import { ChatFileContent } from "./ChatFileContent"
import { ChatMessageList } from "./ChatMessageList"
import { ChatBottomPanel } from "./ChatBottomPanel"
import { SshSetupModal } from "./SshSetupModal"
import { useAgentStateCache } from "../hooks/useAgentStateCache"
import { useMentionsAndSlash } from "../hooks/useMentionsAndSlash"
import { useChatSend } from "../hooks/useChatSend"
import { useChatScroll } from "../hooks/useChatScroll"
import { useStreamingElapsed } from "../hooks/useStreamingElapsed"
import { useFileUpload } from "../hooks/useFileUpload"
import { useOpenInApps } from "../hooks/useOpenInApps"
import { useChatViewActions } from "../hooks/useChatViewActions"
import {
  useProvidersAndModels,
  useDraftAutosave,
  useFlushDraftOnSwitch,
  useInitialMessage,
  useInitialDraft,
  useResetOnAgentSwitch,
} from "../hooks/useChatViewEffects"
import { hasExitPlanModeUnapproved, claudeInPlanMode, extractPlanContent } from "../extract/planMode"
import type { ChatViewProps } from "../chat.types"
import type { ChatInputBarProps } from "./chatInputBarTypes"

type ActiveTab = "chat" | "file" | "diff-browser" | "pr"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildInputBarProps(args: any): ChatInputBarProps {
  return {
    agent: args.agent, allAgents: args.allAgents, providers: args.providers,
    allModels: args.allModels, capabilities: args.capabilities,
    pendingComments: args.pendingComments, attachments: args.attachments,
    linkedAgents: args.linkedAgents,
    mentionAttachments: args.mentionsSlash.mentionAttachments,
    mentionQuery: args.mentionsSlash.mentionQuery,
    mentionOptions: args.mentionsSlash.mentionOptions,
    mentionIndex: args.mentionsSlash.mentionIndex,
    setMentionIndex: args.mentionsSlash.setMentionIndex,
    setMentionQuery: args.mentionsSlash.setMentionQuery,
    applyMention: args.mentionsSlash.applyMention,
    mentionListRef: args.mentionsSlash.mentionListRef,
    mentionActiveRef: args.mentionsSlash.mentionActiveRef,
    slashQuery: args.mentionsSlash.slashQuery,
    setSlashQuery: args.mentionsSlash.setSlashQuery,
    filteredCommands: args.mentionsSlash.filteredCommands,
    slashIndex: args.mentionsSlash.slashIndex,
    setSlashIndex: args.mentionsSlash.setSlashIndex,
    applySlashCommand: args.mentionsSlash.applySlashCommand,
    input: args.input, onInputChange: args.handleInputChange, textareaRef: args.textareaRef,
    isInPlanMode: args.isInPlanMode, planMode: args.planMode, setPlanMode: args.setPlanMode,
    showPlanApproval: args.showPlanApproval, planContent: args.planContent,
    effort: args.effort, setEffort: args.setEffort,
    isStreaming: args.isStreaming, canSend: args.canSend, hideChrome: args.hideChrome,
    fileChanges: args.agent.fileChanges,
    onRemoveComment: args.onRemoveComment, onOpenDiffFile: args.onOpenDiffFile,
    onRemoveAttachment: args.onRemoveAttachment,
    onRemoveLinkedAgent: args.onRemoveLinkedAgent,
    onRemoveMention: args.onRemoveMention,
    onToggleLinkedAgent: args.onToggleLinkedAgent,
    onModelChange: args.handleModelChange, onSend: args.handleSend,
    onPlanApprove: args.handlePlanApprove, onPlanDismiss: args.handlePlanDismiss,
    onUploadFiles: args.uploadFiles, fileInputRef: args.fileInputRef,
    onFileSelect: args.handleFileSelect,
  }
}

function useChatViewState(agent: ChatViewProps["agent"]) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat")
  const [effort, setEffort] = useState<"" | "low" | "medium" | "high" | "max">("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cache = useAgentStateCache(agent.id, agent.draft)
  return { activeTab, setActiveTab, effort, setEffort, textareaRef, cache }
}

export function ChatView(props: ChatViewProps) {
  const {
    agent, isStreaming, loadMore, hasMore = false, isLoadingMore = false,
    openFileTab, onClearFileTab, tabs = [], activeTabId, onTabSelect, onTabClose, onNewTab,
    onTabTitleChange, pendingComments = [], onAddComment, onOpenDiffFile, onRemoveComment,
    onClearComments, githubEnabled = false, pendingQuestion = null, onClearPendingQuestion,
    hideChrome = false, hideHeader = false, onNewTabWithMessage, initialMessage, onConsumeInitialMessage,
    initialDraft, onConsumeInitialDraft,
  } = props

  const { data: allAgents = [] } = useAgents()
  const { data: repos = [] } = useRepos()
  const repoName = repos.find((r) => r.id === agent.repoId)?.name
  const { activeTab, setActiveTab, effort, setEffort, textareaRef, cache } = useChatViewState(agent)
  const { input, setInput, inputRef, linkedAgents, setLinkedAgents, attachments, setAttachments,
    planMode, setPlanMode, awaitingPlanApproval, setAwaitingPlanApproval, prevAgentIdRef } = cache

  const mentionsSlash = useMentionsAndSlash({ agentId: agent.id, setInput })
  const { providers, allModels, capabilities } = useProvidersAndModels(agent)
  const chatSend = useChatSend({
    agent, isStreaming, pendingComments, attachments, linkedAgents,
    mentionAttachments: mentionsSlash.mentionAttachments,
  })
  const uiIsStreaming = chatSend.serverStreaming || chatSend.isSending
  const elapsedSeconds = useStreamingElapsed(uiIsStreaming)
  const { bottomRef, setScrollContainer, isAtBottom, setIsAtBottom } = useChatScroll(agent, uiIsStreaming)
  const { fileInputRef, uploadFiles } = useFileUpload(agent.id, setAttachments)
  const openInApps = useOpenInApps(agent.id)

  useDraftAutosave(agent.id, input)
  useFlushDraftOnSwitch(agent, prevAgentIdRef, inputRef)
  useInitialMessage(initialMessage, onConsumeInitialMessage, chatSend.sendContent)
  useInitialDraft(initialDraft, onConsumeInitialDraft, setInput)
  useResetOnAgentSwitch(agent.id, setActiveTab, setIsAtBottom, bottomRef)

  useEffect(() => {
    if (openFileTab?.type === "diff-browser") setActiveTab("diff-browser")
    else if (openFileTab?.type === "pr") { /* keep chat tab active */ }
    else if (openFileTab) setActiveTab("file")
  }, [openFileTab, setActiveTab])

  const actions = useChatViewActions({
    agent, input, setInput, textareaRef, pendingComments, attachments, setAttachments,
    setLinkedAgents, planMode, setPlanMode, setAwaitingPlanApproval, effort,
    mentionsSlash, chatSend, onClearComments, pendingQuestion, onClearPendingQuestion, uploadFiles,
  })

  const showPlanApproval = !isStreaming && (awaitingPlanApproval || hasExitPlanModeUnapproved(agent.messages))
  const planContent = showPlanApproval ? extractPlanContent(agent.messages) : null
  const isInPlanMode = planMode || claudeInPlanMode(agent.messages)
  const hasInput = input.trim().length > 0 || pendingComments.length > 0 || attachments.length > 0
  const canSend = hasInput && !chatSend.isSending
  const closeFileTab = () => { setActiveTab("chat"); onClearFileTab() }

  const inputBarProps = buildInputBarProps({
    agent, allAgents, providers, allModels, capabilities,
    pendingComments: pendingComments as PRComment[],
    attachments, linkedAgents, mentionsSlash,
    input, handleInputChange: actions.handleInputChange, textareaRef,
    isInPlanMode, planMode, setPlanMode,
    showPlanApproval, planContent,
    effort, setEffort, isStreaming, canSend, hideChrome,
    onRemoveComment, onOpenDiffFile,
    onRemoveAttachment: (path: string) => setAttachments((p) => p.filter((x) => x.path !== path)),
    onRemoveLinkedAgent: (id: string) => setLinkedAgents((p: AgentSummary[]) => p.filter((x: AgentSummary) => x.id !== id)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onRemoveMention: (m: any) => mentionsSlash.setMentionAttachments((p) => p.filter((x) => x !== m)),
    onToggleLinkedAgent: actions.toggleLinkedAgent,
    handleModelChange: actions.handleModelChange,
    handleSend: actions.handleSend,
    handlePlanApprove: actions.handlePlanApprove,
    handlePlanDismiss: () => setAwaitingPlanApproval(false),
    uploadFiles, fileInputRef, handleFileSelect: actions.handleFileSelect,
  })

  const isFileMode = activeTab === "pr" || activeTab === "diff-browser" || (activeTab === "file" && openFileTab)

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {!hideChrome && !hideHeader && (
        <ChatHeaderBar
          agent={agent} repoName={repoName} isStreaming={isStreaming}
          githubEnabled={githubEnabled}
          remoteMode={openInApps.remoteMode} lastOpenInApp={openInApps.lastOpenInApp}
          detectedEditors={openInApps.detectedEditors}
          sshConfigured={openInApps.sshInfo?.configured ?? null}
          onOpenIn={openInApps.handleOpenIn}
          onOpenSshSetup={() => openInApps.setShowSshSetup(true)}
          onSendMessage={actions.broadcastSend}
          onNewTabWithMessage={onNewTabWithMessage}
        />
      )}
      {!hideChrome && (
        <ChatTabBar
          agent={agent} tabs={tabs} activeTab={activeTab} activeTabId={activeTabId}
          openFileTab={openFileTab}
          onTabSelect={onTabSelect} onTabClose={onTabClose} onTabTitleChange={onTabTitleChange}
          onNewTab={onNewTab} onSetActiveTab={setActiveTab} onCloseFileTab={closeFileTab}
        />
      )}
      {isFileMode ? (
        <ChatFileContent
          agent={agent} activeTab={activeTab} openFileTab={openFileTab}
          pendingComments={pendingComments}
          onAddComment={onAddComment} onRemoveComment={onRemoveComment}
        />
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
          {agent.messages.length === 0 && !uiIsStreaming ? (
            <div className="flex-1 min-h-0"><CreationView agent={agent} /></div>
          ) : (
            <ChatMessageList
              agent={agent} uiIsStreaming={uiIsStreaming} elapsedSeconds={elapsedSeconds}
              hasMore={hasMore} isLoadingMore={isLoadingMore} loadMore={loadMore}
              bottomRef={bottomRef} setScrollContainer={setScrollContainer}
              messageQueue={chatSend.messageQueue}
              onEditQueued={(qm) => {
                setInput(() => qm.display)
                chatSend.setMessageQueue((prev) => prev.filter((m) => m.id !== qm.id))
              }}
              onRemoveQueued={(id) => chatSend.setMessageQueue((prev) => prev.filter((m) => m.id !== id))}
            />
          )}
          <ChatBottomPanel
            agent={agent} uiIsStreaming={uiIsStreaming} isAtBottom={isAtBottom}
            bottomRef={bottomRef}
            onScrollToBottom={() => setIsAtBottom(true)}
            pendingQuestion={pendingQuestion}
            onAnswerQuestion={actions.handleAnswerQuestion}
            inputBarProps={inputBarProps}
          />
        </div>
      )}
      {openInApps.showSshSetup && <SshSetupModal onClose={() => openInApps.setShowSshSetup(false)} />}
    </div>
  )
}
