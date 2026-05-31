import {
  IconFolderSymlink,
  IconMessageCircle,
  IconPaperclip,
  IconPhoto,
  IconX,
} from "@tabler/icons-react"
import type { AgentSummary, PRComment, FileChange } from "@huxflux/shared"
import { TerminalChip } from "./TerminalChip"

interface Attachment {
  name: string
  path: string
  mimeType: string
}

type MentionAttachment = { type: "file"; path: string; name: string } | { type: "terminal" }

interface AttachmentChipsProps {
  agentId: string
  pendingComments: PRComment[]
  attachments: Attachment[]
  linkedAgents: AgentSummary[]
  mentionAttachments: MentionAttachment[]
  fileChanges: FileChange[]
  onRemoveComment?: (id: string) => void
  onOpenDiffFile?: (file: FileChange) => void
  onRemoveAttachment: (path: string) => void
  onRemoveLinkedAgent: (id: string) => void
  onRemoveMention: (m: MentionAttachment) => void
}

function CommentChip({ c, fileChanges, onRemoveComment, onOpenDiffFile }: {
  c: PRComment
  fileChanges: FileChange[]
  onRemoveComment?: (id: string) => void
  onOpenDiffFile?: (file: FileChange) => void
}) {
  const loc = c.path ? c.path.split("/").pop() + (c.line ? `:${c.line}` : "") : null
  return (
    <div className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px]">
      <button
        onClick={() => {
          if (c.path && onOpenDiffFile) {
            const file = fileChanges.find((f) => f.path === c.path)
            if (file) onOpenDiffFile(file)
          }
        }}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
      >
        <IconMessageCircle size={12} className="text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-foreground/80">{loc ?? `@${c.author}`}</span>
      </button>
      <span className="text-muted-foreground/50 uppercase tracking-wide font-medium text-[9px]">Comment</span>
      <button onClick={() => onRemoveComment?.(c.id)} className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5">
        <IconX size={11} />
      </button>
    </div>
  )
}

function FileChip({ f, onRemove }: { f: Attachment; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px]">
      {f.mimeType.startsWith("image/")
        ? <IconPhoto size={12} className="text-muted-foreground/60 shrink-0" />
        : <IconPaperclip size={12} className="text-muted-foreground/60 shrink-0" />
      }
      <span className="font-medium text-foreground/80 max-w-[120px] truncate">{f.name}</span>
      <button onClick={onRemove} className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5">
        <IconX size={11} />
      </button>
    </div>
  )
}

function LinkedAgentChip({ a, onRemove }: { a: AgentSummary; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px]">
      <IconFolderSymlink size={12} className="text-blue-400 shrink-0" />
      <span className="font-medium text-blue-300 max-w-[120px] truncate">{a.title}</span>
      <button onClick={onRemove} className="text-blue-400/50 hover:text-blue-300 transition-colors ml-0.5">
        <IconX size={11} />
      </button>
    </div>
  )
}

export function AttachmentChips({
  agentId,
  pendingComments,
  attachments,
  linkedAgents,
  mentionAttachments,
  fileChanges,
  onRemoveComment,
  onOpenDiffFile,
  onRemoveAttachment,
  onRemoveLinkedAgent,
  onRemoveMention,
}: AttachmentChipsProps) {
  const hasChips = pendingComments.length > 0
    || attachments.length > 0
    || linkedAgents.length > 0
    || mentionAttachments.some((m) => m.type === "terminal")
  if (!hasChips) return null
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3">
      {pendingComments.map((c) => (
        <CommentChip key={c.id} c={c} fileChanges={fileChanges} onRemoveComment={onRemoveComment} onOpenDiffFile={onOpenDiffFile} />
      ))}
      {attachments.map((f) => (
        <FileChip key={f.path} f={f} onRemove={() => onRemoveAttachment(f.path)} />
      ))}
      {linkedAgents.map((a) => (
        <LinkedAgentChip key={a.id} a={a} onRemove={() => onRemoveLinkedAgent(a.id)} />
      ))}
      {mentionAttachments.filter((ma) => ma.type === "terminal").map((ma) => (
        <TerminalChip key="__terminal__" agentId={agentId} onRemove={() => onRemoveMention(ma)} />
      ))}
    </div>
  )
}
