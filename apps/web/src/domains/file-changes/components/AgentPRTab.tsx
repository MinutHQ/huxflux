import { ScrollArea } from "@huxflux/ui"
import { api, type PRComment, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { usePRActions } from "../hooks/usePRActions"
import { PRTitle } from "./PRTitle"
import { PRReviewsCard } from "./PRReviewsCard"
import { PRChecksCard } from "./PRChecksCard"
import { PRMergeStatusCard } from "./PRMergeStatusCard"
import { PRMergeActions } from "./PRMergeActions"
import { PRThreadList } from "./PRThreadList"
import { PRDiscussionList } from "./PRDiscussionList"

interface AgentPRTabProps {
  agentId: string
  onAddComment: (c: PRComment) => void
}

/**
 * Per-agent PR comments / review tab body.
 *
 * Renamed from `PRView` to avoid colliding with the standalone PR review
 * page (the full-screen `/review/$prId` route), which now lives in
 * `@/domains/pull-requests` as its own `PRView` component.
 */
export function AgentPRTab({ agentId, onAddComment }: AgentPRTabProps) {
  const actions = usePRActions(agentId)

  const { data: pr, isLoading, error } = useHuxfluxQuery({
    queryKey: queryKeys.prs.details(agentId),
    queryFn: () => api.prs.details(agentId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">Loading...</div>
  }
  if (error || !pr) {
    return <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">No PR data</div>
  }

  const isMergeable = pr.mergeableState === "clean" && !pr.merged && !pr.draft
  const isEmpty =
    pr.reviews.length === 0 &&
    pr.checks.length === 0 &&
    pr.threads.length === 0 &&
    pr.issueComments.length === 0

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
        <PRTitle url={pr.url} title={pr.title} number={pr.number} author={pr.author} />

        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
          <PRReviewsCard pr={pr} onRerequestReview={actions.rerequestReview} />
          {pr.checks.length > 0 && <PRChecksCard pr={pr} />}
          <PRMergeStatusCard pr={pr} isMergeable={isMergeable} />
        </div>

        {!pr.merged && (
          <PRMergeActions
            isDraft={pr.draft}
            isMergeable={isMergeable}
            markingReady={actions.markingReady}
            merging={actions.merging}
            onMarkReady={actions.markReady}
            onMerge={actions.merge}
          />
        )}

        {pr.threads.length > 0 && (
          <PRThreadList
            threads={pr.threads}
            onAddToChat={onAddComment}
            onResolveThread={actions.resolveThread}
            onReply={actions.replyToComment}
          />
        )}

        {pr.issueComments.length > 0 && (
          <PRDiscussionList comments={pr.issueComments} onAddToChat={onAddComment} />
        )}

        {isEmpty && (
          <p className="text-[12px] text-muted-foreground/40 text-center py-4">No reviews or checks yet</p>
        )}
      </div>
    </ScrollArea>
  )
}
