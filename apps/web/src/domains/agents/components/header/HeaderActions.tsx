import { Button } from "@huxflux/ui"
import {
  IconEye,
  IconGitPullRequest,
  IconPlayerPlayFilled,
} from "@tabler/icons-react"
import type { Agent, Repo } from "@huxflux/shared"
import type { SidePaneId, WorkspacePaneId } from "../../agents.types"
import { PRBadges } from "./PRBadges"
import { SidePaneToggles } from "./SidePaneToggles"
import { isGitRepo } from "../../utils"
import { OpenInEditor } from "./OpenInEditor"
import { useOpenInEditor } from "../../hooks/useOpenInEditor"

interface HeaderActionsProps {
  agent: Agent
  repo: Repo | undefined
  isStreaming: boolean
  githubEnabled: boolean
  onCreatePR?: () => void
  onReview?: () => void
  onRun?: () => void
  sidePane?: {
    visible: ReadonlySet<WorkspacePaneId>
    onToggle: (pane: SidePaneId) => void
  }
}

/** Right side of the header: PR badges + the action buttons + open-in + pane toggles. */
export function HeaderActions({
  agent,
  repo,
  isStreaming,
  githubEnabled,
  onCreatePR,
  onReview,
  onRun,
  sidePane,
}: HeaderActionsProps) {
  const openIn = useOpenInEditor({ agentId: agent.id })

  const hasGit = isGitRepo(agent, repo)
  const showCreatePR = hasGit && githubEnabled && !agent.prStatus && !isStreaming && agent.messages.length > 0 && !!onCreatePR
  const showReview = hasGit && !isStreaming && agent.messages.length > 0 && !!onReview
  const showRun = !!repo?.runScript && !!onRun

  return (
    <div className="ml-auto flex items-center gap-2 shrink-0">
      {hasGit && githubEnabled && agent.prStatus && (
        <PRBadges prStatus={agent.prStatus} agentId={agent.id} />
      )}

      {hasGit && githubEnabled && agent.prStatus && (
        <div className="w-px h-4 bg-border" />
      )}

      {showCreatePR && (
        <Button variant="ghost" size="xs" onClick={onCreatePR}>
          <IconGitPullRequest size={12} />
          Create PR
        </Button>
      )}
      {showReview && (
        <Button variant="ghost" size="xs" onClick={onReview}>
          <IconEye size={12} />
          Review
        </Button>
      )}

      {showRun && (
        <Button variant="ghost" size="xs" onClick={onRun}>
          <IconPlayerPlayFilled size={11} />
          Run
        </Button>
      )}

      <OpenInEditor
        agentId={agent.id}
        lastApp={openIn.lastApp}
        remoteMode={openIn.remoteMode}
        detectedEditors={openIn.detectedEditors}
        sshInfo={openIn.sshInfo}
        onOpen={openIn.handleOpenIn}
      />

      {sidePane && (
        <>
          <div className="w-px h-4 bg-border" />
          <SidePaneToggles
            visible={sidePane.visible}
            showDiff={hasGit}
            showPR={hasGit && githubEnabled && !!agent.prStatus}
            onToggle={sidePane.onToggle}
          />
        </>
      )}
    </div>
  )
}
