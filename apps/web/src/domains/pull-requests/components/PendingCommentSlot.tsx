import type { PendingReviewComment } from "../pull-requests.types"
import { SLOT_STYLES as S } from "./diffSlotStyles"
import { InlineMd } from "./InlineMd"

interface PendingCommentSlotProps {
  comment: PendingReviewComment
  isCollapsed: boolean
  isEditing: boolean
  editBody: string
  setEditBody: (v: string) => void
  onSubmitEdit: () => void
  onCancelEdit: () => void
  onToggleCollapse: (id: string) => void
  onStartEdit: (id: string, body: string) => void
  onRemove: (id: string) => void
}

/** A user-authored pending comment rendered as a diff annotation slot. */
export function PendingCommentSlot({
  comment,
  isCollapsed,
  isEditing,
  editBody,
  setEditBody,
  onSubmitEdit,
  onCancelEdit,
  onToggleCollapse,
  onStartEdit,
  onRemove,
}: PendingCommentSlotProps) {
  if (isCollapsed) {
    return (
      <div
        style={{ ...S.card, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.7 }}
        onClick={() => onToggleCollapse(comment.id)}
      >
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>▶</span>
        <span style={{ color: "rgba(96,165,250,0.6)", fontSize: 10, flexShrink: 0 }}>◆</span>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {comment.body}
        </span>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div style={S.card}>
        <textarea
          value={editBody}
          onChange={(e) => {
            setEditBody(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmitEdit()
          }}
          rows={2}
          style={S.textarea}
          autoFocus
        />
        <div style={S.actions}>
          <button
            onClick={onSubmitEdit}
            disabled={!editBody.trim()}
            style={{ ...S.btnPrimary, opacity: editBody.trim() ? 1 : 0.4 }}
          >
            Save
          </button>
          <button onClick={onCancelEdit} style={S.btnGhost}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={S.card}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          fontSize: 12,
          color: "rgba(255,255,255,0.8)",
        }}
      >
        <span
          style={{ color: "rgba(96,165,250,0.6)", fontSize: 10, flexShrink: 0, marginTop: 2, cursor: "pointer" }}
          onClick={() => onToggleCollapse(comment.id)}
        >
          ▼
        </span>
        <span style={{ color: "rgba(96,165,250,0.6)", fontSize: 10, flexShrink: 0, marginTop: 2 }}>◆</span>
        <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
          <InlineMd text={comment.body} />
        </div>
        <button onClick={() => onStartEdit(comment.id, comment.body)} style={S.btnDanger}>
          Edit
        </button>
        <button onClick={() => onRemove(comment.id)} style={S.btnDanger}>
          ✕
        </button>
      </div>
    </div>
  )
}
