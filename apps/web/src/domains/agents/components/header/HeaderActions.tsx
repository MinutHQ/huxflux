import { Button } from "@huxflux/ui"
import {
  IconEye,
  IconGitPullRequest,
  IconPlayerPlayFilled,
} from "@tabler/icons-react"
import type { Agent, Repo } from "@huxflux/shared"
import type { SidePaneLayout, SidePaneSection } from "../../agents.types"
import { PRBadges } from "./PRBadges"
import { SidePaneToggles } from "./SidePaneToggles"
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
    layout: SidePaneLayout
    onToggleTop: (section: SidePaneSection) => void
    onToggleTerminal: () => void
  }
}

/** Right side of the header: PR badges + the action buttons + open-in + side-pane toggles. */
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

  // Folder-type repos don't have branches or PRs.
  const isGitRepo = repo?.type !== "folder" && agent.branch !== "local"
  const showCreatePR = isGitRepo && githubEnabled && !agent.prStatus && !isStreaming && agent.messages.length > 0 && !!onCreatePR
  const showReview = isGitRepo && !isStreaming && agent.messages.length > 0 && !!onReview
  const showRun = !!repo?.runScript && !!onRun

  return (
    <div className="ml-auto flex items-center gap-2 shrink-0">
      {isGitRepo && githubEnabled && agent.prStatus && (
        <PRBadges prStatus={agent.prStatus} agentId={agent.id} />
      )}

      {isGitRepo && githubEnabled && agent.prStatus && (
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
            layout={sidePane.layout}
            showPR={isGitRepo && githubEnabled && !!agent.prStatus}
            onToggleTop={sidePane.onToggleTop}
            onToggleTerminal={sidePane.onToggleTerminal}
          />
        </>
      )}
    </div>
  )
}
