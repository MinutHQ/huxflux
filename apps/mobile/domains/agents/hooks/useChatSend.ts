import { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, buildAttachedFilesBlock, buildLineCommentsBlock, queryKeys, type Agent, type PRComment } from "@huxflux/shared"
import { consumeSetupMessage } from "@/lib/setupMessage"
import type { Attachment } from "../agents.types"

/**
 * Owns the message-send pipeline: input draft, queued-while-streaming (sent at once
 * while the agent waits on a question), attachments,
 * optimistic-then-network send, and the setup-message hand-off from new-agent.
 */
export function useChatSend(rootId: string, activeSessionId: string | null, isStreaming: boolean, hasPendingQuestion: boolean) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [planMode, setPlanMode] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  // Line comments added from the Files tab; sent as a block ahead of the next message.
  const [comments, setComments] = useState<PRComment[]>([])

  function addComment(comment: PRComment) {
    setComments((prev) => (prev.some((p) => p.id === comment.id) ? prev : [...prev, comment]))
  }

  function removeComment(id: string) {
    setComments((prev) => prev.filter((p) => p.id !== id))
  }

  async function doSend(content: string) {
    if (!activeSessionId || !content.trim()) return
    setSending(true)
    const optimisticId = `optimistic-${Date.now()}`
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(activeSessionId), (old) => {
      if (!old) return old
      return {
        ...old,
        messages: [...old.messages, { id: optimisticId, role: "user", content, timestamp: new Date().toISOString() }],
      }
    })
    try {
      // fire-and-forget; intentional: optimistic-rollback send with custom cache mutations
      // eslint-disable-next-line no-restricted-syntax
      await api.agents.sendMessage(activeSessionId, content)
    } catch {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(activeSessionId), (old) => {
        if (!old) return old
        return { ...old, messages: old.messages.filter((m) => m.id !== optimisticId) }
      })
    } finally {
      setSending(false)
    }
  }

  function handleSend() {
    const text = input.trim()
    if ((!text && attachments.length === 0 && comments.length === 0) || !rootId || sending) return
    const content = buildAttachedFilesBlock(buildLineCommentsBlock(comments, text), attachments)
    setInput("")
    setAttachments([])
    setComments([])
    // A turn parked on a question never ends on its own, so a queued message
    // would never go out. The server turns a message sent now into the answer.
    if (isStreaming && !hasPendingQuestion) {
      setQueuedMessage(content)
      return
    }
    doSend(content)
  }

  // Auto-send queued message when streaming ends
  useEffect(() => {
    if (!isStreaming && queuedMessage !== null) {
      const msg = queuedMessage
      setQueuedMessage(null)
      doSend(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  // Send message queued during agent setup
  const setupMsgSent = useRef(false)
  useEffect(() => {
    if (setupMsgSent.current || !activeSessionId) return
    const msg = consumeSetupMessage()
    if (msg) {
      setupMsgSent.current = true
      doSend(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId])

  return {
    input, setInput, sending,
    queuedMessage, setQueuedMessage,
    thinking, setThinking, planMode, setPlanMode,
    attachments, setAttachments,
    comments, addComment, removeComment,
    handleSend,
  }
}
