import { useCallback, useState } from "react"
import { IconSparkles } from "@tabler/icons-react"
import { useAgent } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import { ChatView } from "@/domains/chat/ChatView"
import { RefinementStartInput } from "./RefinementStartInput"

/**
 * Outer wrapper remounts on a fresh `item.id` so `localAgentId` resets
 * cleanly without needing an effect to mirror it from props.
 */
export function TaskChatPanel({
  item,
  onReply,
}: {
  item: TaskItem
  onReply: (content: string) => Promise<string | null>
}) {
  return <TaskChatPanelInner key={item.id} item={item} onReply={onReply} />
}

function TaskChatPanelInner({
  item,
  onReply,
}: {
  item: TaskItem
  onReply: (content: string) => Promise<string | null>
}) {
  const [localAgentId, setLocalAgentId] = useState<string | null>(
    item.refineAgentId ?? null,
  )
  const agentId = localAgentId ?? item.refineAgentId ?? null

  const { data: refineAgent, isStreaming, loadMore, hasMore, isLoadingMore } =
    useAgent(agentId)

  // Wrap onReply to capture the agentId for immediate subscription
  const handleReply = useCallback(
    async (content: string) => {
      const newAgentId = await onReply(content)
      if (newAgentId) setLocalAgentId(newAgentId)
    },
    [onReply],
  )

  // Before the refine agent exists, show an empty state with a prompt
  if (!refineAgent) {
    return (
      <div className="h-full flex flex-col border-l border-border">
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
            <IconSparkles size={20} className="text-purple-400" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Discuss this task</p>
            <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[280px]">
              Ask questions, discuss scope, or let AI help refine the requirements
            </p>
          </div>
        </div>
        {/* Minimal input to start the conversation */}
        <div className="shrink-0 px-5 py-4">
          <RefinementStartInput onSend={handleReply} />
        </div>
      </div>
    )
  }

  // Once the agent exists, render the full ChatView
  return (
    <div className="h-full border-l border-border">
      <ChatView
        agent={refineAgent}
        isStreaming={isStreaming}
        loadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        openFileTab={null}
        onClearFileTab={() => {}}
        hideChrome
      />
    </div>
  )
}
