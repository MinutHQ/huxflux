import React, { useState } from "react"
import {
  api,
  type PRIssueComment,
  type PRThread,
  type PullRequest,
  useHuxfluxMutation,
} from "@huxflux/shared"
import { ScrollArea } from "@huxflux/ui"
import { IconLoader2, IconMessageCircle2 } from "@tabler/icons-react"
import { toast } from "sonner"
import type { PRDetailsHeader } from "../pull-requests.types"
import { MarkdownContent } from "./MarkdownContent"
import { IssueCommentCard } from "./IssueCommentCard"
import { ThreadCard } from "./ThreadCard"

interface ConversationsTabProps {
  pr: PullRequest
  loadingDetails: boolean
  description: string
  prDetails: PRDetailsHeader | null
  issueComments: PRIssueComment[]
  threads: PRThread[]
  fileDiffs: Record<string, string>
  currentUser?: string
  setIssueComments: React.Dispatch<React.SetStateAction<PRIssueComment[]>>
  setThreads: React.Dispatch<React.SetStateAction<PRThread[]>>
  handleAttachToChat: (thread: PRThread) => void
}

type Activity =
  | { kind: "comment"; createdAt: string; item: PRIssueComment }
  | { kind: "thread"; createdAt: string; item: PRThread }

function combineActivity(issueComments: PRIssueComment[], threads: PRThread[]): Activity[] {
  return [
    ...issueComments.map((c) => ({ kind: "comment" as const, createdAt: c.createdAt, item: c })),
    ...threads.map((t) => ({
      kind: "thread" as const,
      createdAt: t.comments[0]?.createdAt ?? "",
      item: t,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Conversations tab body: PR summary + interleaved discussion comments and
 * line-anchored review threads, followed by a "leave a comment" composer.
 */
export function ConversationsTab({
  pr,
  loadingDetails,
  description,
  prDetails,
  issueComments,
  threads,
  fileDiffs,
  currentUser,
  setIssueComments,
  setThreads,
  handleAttachToChat,
}: ConversationsTabProps) {
  const [commentBody, setCommentBody] = useState("")

  const submitMut = useHuxfluxMutation<unknown, string>({
    mutationFn: (body) => api.prs.sendSingleComment(pr.repoId!, pr.number, body),
    onSuccess: (_data, body) => {
      setIssueComments((prev) => [
        ...prev,
        {
          id: Date.now(),
          author: currentUser ?? "You",
          body,
          createdAt: new Date().toISOString(),
          url: "",
        },
      ])
      setCommentBody("")
      toast.success("Comment posted")
    },
    onError: (err) => toast.error((err as Error).message),
  })
  const submitting = submitMut.isPending

  function submitComment() {
    if (!commentBody.trim() || !pr.repoId) return
    submitMut.mutate(commentBody.trim())
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        {loadingDetails ? (
          <ConversationsLoading />
        ) : (
          <ConversationsList
            pr={pr}
            description={description}
            prDetails={prDetails}
            issueComments={issueComments}
            threads={threads}
            fileDiffs={fileDiffs}
            currentUser={currentUser}
            setThreads={setThreads}
            handleAttachToChat={handleAttachToChat}
          />
        )}
      </ScrollArea>

      {pr.repoId && (
        <ConversationsComposer
          commentBody={commentBody}
          setCommentBody={setCommentBody}
          submitting={submitting}
          disabled={!commentBody.trim() || !pr.repoId}
          onSubmit={submitComment}
        />
      )}
    </div>
  )
}

function ConversationsLoading() {
  return (
    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground/40">
      <IconLoader2 size={14} className="animate-spin" />
      <span className="text-[12px]">Loading…</span>
    </div>
  )
}

function ConversationsList({
  pr,
  description,
  prDetails,
  issueComments,
  threads,
  fileDiffs,
  currentUser,
  setThreads,
  handleAttachToChat,
}: {
  pr: PullRequest
  description: string
  prDetails: PRDetailsHeader | null
  issueComments: PRIssueComment[]
  threads: PRThread[]
  fileDiffs: Record<string, string>
  currentUser?: string
  setThreads: React.Dispatch<React.SetStateAction<PRThread[]>>
  handleAttachToChat: (thread: PRThread) => void
}) {
  const items = combineActivity(issueComments, threads)
  const summary = description || prDetails?.body

  if (items.length === 0 && !summary) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground/30">
        <IconMessageCircle2 size={20} />
        <span className="text-[12px]">No conversations yet</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {summary && <ConversationsSummary content={summary} />}
      {items.map((entry) =>
        entry.kind === "comment" ? (
          <IssueCommentCard key={`ic-${entry.item.id}`} comment={entry.item} />
        ) : (
          <ThreadCard
            key={`th-${entry.item.id}`}
            thread={entry.item}
            repoId={pr.repoId ?? ""}
            prNumber={pr.number}
            fileDiffs={fileDiffs}
            currentUser={currentUser}
            onReplied={(threadId, reply) =>
              setThreads((prev) =>
                prev.map((th) => (th.id === threadId ? { ...th, comments: [...th.comments, reply] } : th)),
              )
            }
            onResolved={(threadId) => setThreads((prev) => prev.filter((th) => th.id !== threadId))}
            onAttachToChat={handleAttachToChat}
          />
        ),
      )}
    </div>
  )
}

function ConversationsSummary({ content }: { content: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border/50">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Summary</span>
      </div>
      <div className="px-3 py-2.5 text-[13px] text-foreground/80">
        <MarkdownContent content={content} />
      </div>
    </div>
  )
}

function ConversationsComposer({
  commentBody,
  setCommentBody,
  submitting,
  disabled,
  onSubmit,
}: {
  commentBody: string
  setCommentBody: (s: string) => void
  submitting: boolean
  disabled: boolean
  onSubmit: () => void
}) {
  return (
    <div className="border-t border-border p-3 shrink-0 space-y-2">
      <textarea
        value={commentBody}
        onChange={(e) => setCommentBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit()
        }}
        placeholder="Leave a comment…"
        rows={2}
        className="w-full text-[12px] bg-secondary/40 border border-input rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/30">⌘↵ to submit</span>
        <button
          onClick={onSubmit}
          disabled={disabled || submitting}
          className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-1.5"
        >
          {submitting && <IconLoader2 size={11} className="animate-spin" />}
          Comment
        </button>
      </div>
    </div>
  )
}
