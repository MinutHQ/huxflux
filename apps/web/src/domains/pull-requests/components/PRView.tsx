import { useState } from "react"
import type { PullRequest } from "@huxflux/shared"
import { usePRDetails } from "../hooks/usePRDetails"
import { usePendingComments } from "../hooks/usePendingComments"
import { useViewedFiles } from "../hooks/useViewedFiles"
import { useDiffStyle } from "../hooks/useDiffStyle"
import { PRHeader } from "./PRHeader"
import { PRTabBar, type PRTab } from "./PRTabBar"
import { ConversationsTab } from "./ConversationsTab"
import { ChangesTab } from "./ChangesTab"

interface PRViewProps {
  pr: PullRequest
}

/**
 * Standalone full-screen PR review page (route: `/review/$prId`). Hosts the
 * header, the two-tab body (Conversations / Changes), and the submit-review
 * flow. Not to be confused with the per-agent `AgentPRTab` in the
 * file-changes domain — that's a different surface inside the agent route.
 */
export function PRView({ pr }: PRViewProps) {
  const [activeTab, setActiveTab] = useState<PRTab>("conversations")
  const [showSubmitPopover, setShowSubmitPopover] = useState(false)

  const details = usePRDetails(pr)
  const { pendingComments, savePendingComments } = usePendingComments(pr.repoId, pr.number)
  const { viewedFiles, toggleViewed, setAll: setAllViewed } = useViewedFiles(pr.repoId, pr.number)
  const { diffStyle, setDiffStyle } = useDiffStyle()

  const counts: Partial<Record<PRTab, number | undefined>> = {
    conversations: details.issueComments.length + details.threads.length || undefined,
    changes: details.prFiles.length || undefined,
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
        <PRHeader
          pr={pr}
          prDetails={details.prDetails}
          branch={details.branch}
          baseBranch={details.baseBranch}
          checks={details.checks}
          mergeableState={details.mergeableState}
          pendingComments={pendingComments}
          showSubmitPopover={showSubmitPopover}
          setShowSubmitPopover={setShowSubmitPopover}
          onReviewSubmitted={() => savePendingComments([])}
        />
        <PRTabBar activeTab={activeTab} setActiveTab={setActiveTab} counts={counts} />
      </div>

      {activeTab === "conversations" && (
        <ConversationsTab
          pr={pr}
          loadingDetails={details.loadingDetails}
          description={details.description}
          prDetails={details.prDetails}
          issueComments={details.issueComments}
          threads={details.threads}
          fileDiffs={details.fileDiffs}
          currentUser={details.currentUser}
          setIssueComments={details.setIssueComments}
          setThreads={details.setThreads}
          handleAttachToChat={() => {}}
        />
      )}

      {activeTab === "changes" && (
        <ChangesTab
          pr={pr}
          prFiles={details.prFiles}
          fileDiffs={details.fileDiffs}
          threads={details.threads}
          setThreads={details.setThreads}
          currentUser={details.currentUser}
          viewedFiles={viewedFiles}
          toggleViewed={toggleViewed}
          setAllViewed={setAllViewed}
          expandedFiles={details.expandedFiles}
          setExpandedFiles={details.setExpandedFiles}
          pendingComments={pendingComments}
          savePendingComments={savePendingComments}
          diffStyle={diffStyle}
          setDiffStyle={setDiffStyle}
          loadingFiles={details.loadingFiles}
        />
      )}
    </div>
  )
}
