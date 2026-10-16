import { useCallback } from "react"
import type { PRComment } from "@huxflux/shared"
import { useModal } from "@/ui"

/**
 * Long-press-a-line commenting for the Files tab: prompts for the text and
 * hands a `PRComment` to the chat composer, which sends it with the next message.
 */
export function useLineComment(onAddComment: (c: PRComment) => void) {
  const modal = useModal()
  return useCallback((path: string, line: number) => {
    const name = path.split("/").pop() ?? path
    modal.showPrompt(`Comment on ${name}:${line}`, "", (body) => {
      if (!body.trim()) return
      onAddComment({
        id: `inline-${Date.now()}`, author: "You", body: body.trim(), createdAt: new Date().toISOString(),
        url: "", isReply: false, path, line,
      })
    }, "Your comment (sent with your next message)")
  }, [modal, onAddComment])
}
