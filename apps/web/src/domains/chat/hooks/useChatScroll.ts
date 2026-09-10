import { useCallback, useRef, useState } from "react"

type Detach = () => void

/**
 * Scroll state for the message list.
 *
 * Every scroll is applied to the list container itself (`scrollTo`), never via
 * `scrollIntoView` on a bottom sentinel: `scrollIntoView` also scrolls every
 * scrollable ancestor, including the `overflow-hidden` panel frames around the
 * chat. When the list was momentarily taller than its frame (layout settling
 * on mount, a tall bottom panel) the frame itself got scrolled, the chat looked
 * empty, and it only snapped back on the next scroll that re-aligned it.
 *
 * Following the bottom is driven by a ResizeObserver on the content: whenever
 * the content grows (streamed text, tool calls, late markdown/image layout) and
 * the user was at the bottom before the growth, the list is pinned again. A
 * user scrolling up (more than 80px from the bottom) stops the following until
 * they scroll back down or press "Scroll to bottom".
 */
export function useChatScroll() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const detachContainerRef = useRef<Detach | null>(null)
  const detachContentRef = useRef<Detach | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  // Mirror of `isAtBottom` readable from observer callbacks without re-binding.
  const followRef = useRef(true)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "instant") => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const markAtBottom = useCallback((value: boolean) => {
    followRef.current = value
    setIsAtBottom(value)
  }, [])

  // Callback ref: attaches the scroll listener as soon as the element mounts
  // (useEffect with [] misses it when the element is initially absent).
  const setScrollContainer = useCallback((el: HTMLDivElement | null) => {
    detachContainerRef.current?.()
    detachContainerRef.current = null
    scrollContainerRef.current = el
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      markAtBottom(dist < 80)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    detachContainerRef.current = () => el.removeEventListener("scroll", onScroll)
    // A fresh list (mount, agent switch) always opens at the bottom.
    followRef.current = true
    setIsAtBottom(true)
    el.scrollTo({ top: el.scrollHeight })
  }, [markAtBottom])

  // Callback ref for the inner content wrapper: keep the bottom pinned while
  // the user is following, on every content size change.
  const setScrollContent = useCallback((el: HTMLDivElement | null) => {
    detachContentRef.current?.()
    detachContentRef.current = null
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (followRef.current) scrollToBottom("instant")
    })
    observer.observe(el)
    detachContentRef.current = () => observer.disconnect()
  }, [scrollToBottom])

  const jumpToBottom = useCallback(() => {
    markAtBottom(true)
    scrollToBottom("smooth")
  }, [markAtBottom, scrollToBottom])

  // Agent switch inside a ChatView that stays mounted (automation builder,
  // task panel): re-arm following and land on the new transcript's bottom.
  const resetToBottom = useCallback(() => {
    markAtBottom(true)
    scrollToBottom("instant")
  }, [markAtBottom, scrollToBottom])

  return { setScrollContainer, setScrollContent, isAtBottom, jumpToBottom, resetToBottom }
}
