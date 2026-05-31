import { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys, type Agent } from "@huxflux/shared"
import { consumeSetupMessage } from "@/lib/setupMessage"
import type { Attachment } from "../agents.types"

function buildContent(text: string, attachments: Attachment[]) {
  if (attachments.length === 0) return text
  const fileBlock = attachments.map((f) => `- ${f.name}: ${f.path}`).join("\n")
  return `Attached files:\n${fileBlock}\n\n---\n\n${text}`
}

/**
 * Owns the message-send pipeline: input draft, queued-while-streaming, attachments,
 * optimistic-then-network send, and the setup-message hand-off from new-agent.
 */
export function useChatSend(rootId: string, activeSessionId: string | null, isStreaming: boolean) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [planMode, setPlanMode] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])

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
    if ((!text && attachments.length === 0) || !rootId || sending) return
    const content = buildContent(text, attachments)
    setInput("")
    setAttachments([])
    if (isStreaming) {
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
    handleSend,
  }
}
