import { useCallback, useRef } from "react"
import { ScrollArea } from "@huxflux/ui"
import { IconFlask } from "@tabler/icons-react"
import type { Repo } from "@huxflux/shared"
import type { RefineSession } from "../../tasks.types"
import { useRefineConversation } from "../../hooks/useRefineConversation"
import { MessageBubble } from "./MessageBubble"
import { RefineInput } from "./RefineInput"
import { TypingIndicator } from "./TypingIndicator"

function ConversationHeader({ session }: { session: RefineSession }) {
  return (
    <div className="px-4 py-2.5 border-b border-border shrink-0 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <IconFlask size={13} className="text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          Refinement
        </span>
      </div>
      <span className="text-[11px] font-mono text-muted-foreground/40">{session.ticketId}</span>
    </div>
  )
}

export function ConversationPane({
  session,
  onUpdate,
  repos,
}: {
  session: RefineSession
  onUpdate: (s: RefineSession) => void
  repos: Repo[]
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const {
    isTyping,
    selectedRepos,
    setSelectedRepos,
    reposConfirmed,
    handleReposConfirm,
    handleSend,
  } = useRefineConversation({ session, onUpdate, repos })

  // Scroll to bottom on new messages / typing change — use ref callback to trigger on each relevant change
  const messagesLen = session.messages.length
  const bottomRefCb = useCallback(
    (el: HTMLDivElement | null) => {
      bottomRef.current = el
      el?.scrollIntoView({ behavior: "smooth" })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messagesLen, isTyping],
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <ConversationHeader session={session} />

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {session.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              repos={repos}
              selectedRepos={selectedRepos}
              onReposChange={setSelectedRepos}
              onReposConfirm={handleReposConfirm}
              reposConfirmed={reposConfirmed}
            />
          ))}
          {isTyping && (
            <div className="flex gap-2 items-start">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <IconFlask size={11} className="text-primary" />
              </div>
              <TypingIndicator />
            </div>
          )}
          <div ref={bottomRefCb} />
        </div>
      </ScrollArea>

      <RefineInput session={session} isTyping={isTyping} onSend={handleSend} />
    </div>
  )
}
