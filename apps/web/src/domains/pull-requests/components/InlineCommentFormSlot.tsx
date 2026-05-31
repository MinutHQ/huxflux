import React from "react"
import { SLOT_STYLES as S } from "./diffSlotStyles"

interface InlineCommentFormSlotProps {
  commentRange: { start: number; end: number }
  commentBody: string
  setCommentBody: (v: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onSubmit: () => void
  onCancel: () => void
}

/** New-comment form slot rendered above a selected diff range. */
export function InlineCommentFormSlot({
  commentRange,
  commentBody,
  setCommentBody,
  textareaRef,
  onSubmit,
  onCancel,
}: InlineCommentFormSlotProps) {
  const rangeLabel =
    commentRange.start !== commentRange.end
      ? `lines ${commentRange.start}–${commentRange.end}`
      : `line ${commentRange.end}`

  return (
    <div style={S.card}>
      <textarea
        ref={textareaRef}
        value={commentBody}
        onChange={(e) => {
          setCommentBody(e.target.value)
          e.target.style.height = "auto"
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit()
        }}
        placeholder={`Comment on ${rangeLabel}…`}
        rows={2}
        style={S.textarea}
      />
      <div style={S.actions}>
        <button
          onClick={onSubmit}
          disabled={!commentBody.trim()}
          style={{ ...S.btnPrimary, opacity: commentBody.trim() ? 1 : 0.4 }}
        >
          Add comment
        </button>
        <button onClick={onCancel} style={S.btnGhost}>
          Cancel
        </button>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginLeft: "auto" }}>⌘↵</span>
      </div>
    </div>
  )
}
