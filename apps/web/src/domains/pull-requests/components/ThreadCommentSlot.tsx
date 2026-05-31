import type { PRThread } from "@huxflux/shared"
import { SLOT_STYLES as S } from "./diffSlotStyles"
import { InlineMd } from "./InlineMd"
import { relativeTime } from "../utils"

interface ThreadCommentSlotProps {
  thread: PRThread
  currentUser?: string
  sending: boolean
  isCollapsed: boolean
  isReplying: boolean
  replyBody: string
  setReplyBody: (v: string) => void
  onToggleCollapse: (id: string) => void
  onStartReply: (id: string) => void
  onCancelReply: () => void
  onSubmitReply: (thread: PRThread) => void
  onResolveThread: (id: string) => void
  onDeleteComment: (commentDatabaseId: number, threadId: string) => void
}

/**
 * Persisted PR thread rendered as a diff annotation slot. Supports
 * collapse, reply, resolve, and delete-my-comment.
 */
export function ThreadCommentSlot({
  thread,
  currentUser,
  sending,
  isCollapsed,
  isReplying,
  replyBody,
  setReplyBody,
  onToggleCollapse,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onResolveThread,
  onDeleteComment,
}: ThreadCommentSlotProps) {
  if (!thread.comments.length) return null
  const root = thread.comments[0]!

  if (isCollapsed) {
    return <CollapsedThreadCard thread={thread} root={root} onToggle={() => onToggleCollapse(thread.id)} />
  }

  return (
    <div style={{ ...S.card, ...(thread.isResolved ? { opacity: 0.7, borderLeft: "2px solid rgba(52,211,153,0.3)" } : {}) }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}
        onClick={() => onToggleCollapse(thread.id)}
      >
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>▼</span>
        {thread.isResolved && <span style={{ fontSize: 10, color: "rgba(52,211,153,0.6)" }}>✓ Resolved</span>}
      </div>
      {thread.comments.map((c) => {
        const isMine = currentUser && c.author === currentUser
        return (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              ...(c.isReply ? { paddingTop: 6, paddingLeft: 28 } : {}),
            }}
          >
            {!c.isReply && <Avatar avatarUrl={c.avatarUrl} author={c.author} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <strong style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>{c.author}</strong>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{relativeTime(c.createdAt)}</span>
                {isMine && c.databaseId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteComment(c.databaseId!, thread.id)
                    }}
                    disabled={sending}
                    style={{ ...S.btnDanger, marginLeft: "auto" }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>
                <InlineMd text={c.body} />
              </div>
            </div>
          </div>
        )
      })}
      {isReplying ? (
        <ReplyForm
          replyBody={replyBody}
          setReplyBody={setReplyBody}
          sending={sending}
          onSubmit={() => onSubmitReply(thread)}
          onCancel={onCancelReply}
        />
      ) : (
        <ReplyActions
          showResolve={!thread.isResolved && !!currentUser && root.author === currentUser}
          sending={sending}
          onStartReply={() => onStartReply(thread.id)}
          onResolve={() => onResolveThread(thread.id)}
        />
      )}
    </div>
  )
}

function CollapsedThreadCard({
  thread,
  root,
  onToggle,
}: {
  thread: PRThread
  root: PRThread["comments"][number]
  onToggle: () => void
}) {
  return (
    <div
      style={{
        ...S.card,
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        opacity: thread.isResolved ? 0.5 : 0.7,
      }}
      onClick={onToggle}
    >
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>▶</span>
      <Avatar avatarUrl={root.avatarUrl} author={root.author} small />
      <strong style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{root.author}</strong>
      <span
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {root.body}
      </span>
      {thread.comments.length > 1 && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
          {thread.comments.length} comments
        </span>
      )}
      {thread.isResolved && (
        <span style={{ fontSize: 10, color: "rgba(52,211,153,0.6)", flexShrink: 0 }}>✓ Resolved</span>
      )}
    </div>
  )
}

function Avatar({ avatarUrl, author, small }: { avatarUrl?: string; author?: string; small?: boolean }) {
  const size = small ? 16 : 20
  const fontSize = small ? 8 : 9
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.1)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 600,
        color: "rgba(255,255,255,0.4)",
      }}
    >
      {(author?.[0] ?? "?").toUpperCase()}
    </div>
  )
}

function ReplyForm({
  replyBody,
  setReplyBody,
  sending,
  onSubmit,
  onCancel,
}: {
  replyBody: string
  setReplyBody: (v: string) => void
  sending: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ paddingTop: 8 }}>
      <textarea
        value={replyBody}
        onChange={(e) => {
          setReplyBody(e.target.value)
          e.target.style.height = "auto"
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit()
        }}
        placeholder="Reply…"
        rows={1}
        style={S.textarea}
        autoFocus
      />
      <div style={S.actions}>
        <button
          onClick={onSubmit}
          disabled={!replyBody.trim() || sending}
          style={{ ...S.btnPrimary, opacity: replyBody.trim() && !sending ? 1 : 0.4 }}
        >
          Reply
        </button>
        <button onClick={onCancel} style={S.btnGhost}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function ReplyActions({
  showResolve,
  sending,
  onStartReply,
  onResolve,
}: {
  showResolve: boolean
  sending: boolean
  onStartReply: () => void
  onResolve: () => void
}) {
  return (
    <div style={{ ...S.actions, paddingTop: 6 }}>
      <button onClick={onStartReply} style={{ ...S.btnGhost, color: "rgba(96,165,250,0.7)" }}>
        ↩ Reply
      </button>
      {showResolve && (
        <button onClick={onResolve} disabled={sending} style={S.btnGhost}>
          ✓ Resolve
        </button>
      )}
    </div>
  )
}
