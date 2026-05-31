import { useCallback, useEffect, useRef, useState } from "react"
import type { Agent } from "@huxflux/shared"

export function useChatScroll(agent: Agent, uiIsStreaming: boolean) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Callback ref: attaches the scroll listener as soon as the element mounts
  // (useEffect with [] misses it when the element is initially absent)
  const setScrollContainer = useCallback((el: HTMLDivElement | null) => {
    const prev = scrollContainerRef.current
    if (prev) {
      const handler = (prev as HTMLDivElement & { _scrollHandler?: () => void })._scrollHandler
      if (handler) prev.removeEventListener("scroll", handler)
    }
    scrollContainerRef.current = el
    if (el) {
      const onScroll = () => {
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight
        setIsAtBottom(dist < 80)
      }
      ;(el as HTMLDivElement & { _scrollHandler?: () => void })._scrollHandler = onScroll
      el.addEventListener("scroll", onScroll, { passive: true })
    }
  }, [])

  // Auto-scroll to bottom when streaming, but only if the user is already at the bottom
  const lastMessage = agent.messages[agent.messages.length - 1]
  const streamingContentLen = lastMessage?.content?.length ?? 0
  const streamingToolCallsLen = lastMessage?.toolCalls?.length ?? 0
  useEffect(() => {
    if (uiIsStreaming && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [uiIsStreaming, isAtBottom, agent.messages.length, streamingContentLen, streamingToolCallsLen])

  return { bottomRef, setScrollContainer, isAtBottom, setIsAtBottom }
}
