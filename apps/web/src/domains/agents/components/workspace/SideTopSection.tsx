import type { Agent, PRComment } from "@huxflux/shared"
import { DiffPane } from "@/domains/file-changes/DiffPane"
import { FilesPane } from "@/domains/file-changes/FilesPane"
import { AgentPRTab } from "@/domains/file-changes/AgentPRTab"
import type { FileBuffers } from "@/domains/file-changes/useFileBuffers"
import type { SidePaneSection } from "../../agents.types"
import { PaneWindowControls } from "./PaneWindowControls"

export interface PaneRequests {
  diffFocus: { path: string; nonce: number } | null
  fileOpen: { path: string; line?: number; nonce: number } | null
}

interface SideTopSectionProps {
  section: SidePaneSection
  agent: Agent
  buffers: FileBuffers
  requests: PaneRequests
  onOpenFile: (path: string) => void
  pendingComments: PRComment[]
  onAddComment: (c: PRComment) => void
  onRemoveComment: (id: string) => void
  maximized: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

/** Renders whichever top section (Diff, Files, PR) the side pane is showing. */
export function SideTopSection(props: SideTopSectionProps) {
  const controls = <PaneWindowControls maximized={props.maximized} onToggleMaximize={props.onToggleMaximize} onClose={props.onClose} />
  const comments = { pendingComments: props.pendingComments, onAddComment: props.onAddComment, onRemoveComment: props.onRemoveComment }

  if (props.section === "diff") {
    return <DiffPane agent={props.agent} focusRequest={props.requests.diffFocus} onOpenFile={props.onOpenFile} controls={controls} {...comments} />
  }
  if (props.section === "files") {
    return <FilesPane agent={props.agent} buffers={props.buffers} openRequest={props.requests.fileOpen} controls={controls} {...comments} />
  }
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 h-9 px-3 pr-1.5 border-b border-border/60 shrink-0">
        <span className="text-[12px] font-medium text-foreground">Pull request</span>
        <div className="ml-auto flex items-center gap-0.5">{controls}</div>
      </div>
      <div className="flex-1 min-h-0">
        <AgentPRTab agentId={props.agent.id} onAddComment={props.onAddComment} />
      </div>
    </div>
  )
}
