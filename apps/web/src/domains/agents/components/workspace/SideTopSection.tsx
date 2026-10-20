import type { Agent, PRComment } from "@huxflux/shared"
import { DiffPane } from "@/domains/file-changes/DiffPane"
import { FilesPane } from "@/domains/file-changes/FilesPane"
import { AgentPRTab } from "@/domains/file-changes/AgentPRTab"
import type { FileBuffers } from "@/domains/file-changes/useFileBuffers"

export interface PaneRequests {
  diffFocus: { path: string; nonce: number } | null
  fileOpen: { path: string; line?: number; nonce: number } | null
}

interface SideTopSectionProps {
  section: "diff" | "files" | "pr"
  agent: Agent
  buffers: FileBuffers
  requests: PaneRequests
  onOpenFile: (path: string) => void
  pendingComments: PRComment[]
  onAddComment: (c: PRComment) => void
  onRemoveComment: (id: string) => void
}

/** Renders the body of a Diff, Files, or PR pane. The dock tab above it is the title bar. */
export function SideTopSection(props: SideTopSectionProps) {
  const comments = { pendingComments: props.pendingComments, onAddComment: props.onAddComment, onRemoveComment: props.onRemoveComment }

  if (props.section === "diff") {
    return <DiffPane agent={props.agent} focusRequest={props.requests.diffFocus} onOpenFile={props.onOpenFile} {...comments} />
  }
  if (props.section === "files") {
    return <FilesPane agent={props.agent} buffers={props.buffers} openRequest={props.requests.fileOpen} {...comments} />
  }
  return (
    <div className="flex-1 min-h-0">
      <AgentPRTab agentId={props.agent.id} onAddComment={props.onAddComment} />
    </div>
  )
}
