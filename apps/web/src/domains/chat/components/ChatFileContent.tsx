import type { Agent, FileChange, PRComment } from "@huxflux/shared"
import { DiffView } from "@/domains/file-changes/DiffView"
import { FileContentView } from "@/domains/file-changes/FileContentView"
import { StackedDiffView } from "@/domains/file-changes/StackedDiffView"
import { AgentPRTab as PRTabView } from "@/domains/file-changes/AgentPRTab"
import type { OpenFile } from "@/app-shell/workspace"

type ActiveTab = "chat" | "file" | "diff-browser" | "pr"

interface ChatFileContentProps {
  agent: Agent
  activeTab: ActiveTab
  openFileTab: OpenFile | null
  pendingComments: PRComment[]
  onAddComment?: (c: PRComment) => void
  onRemoveComment?: (id: string) => void
}

export function ChatFileContent({ agent, activeTab, openFileTab, pendingComments, onAddComment, onRemoveComment }: ChatFileContentProps) {
  if (activeTab === "pr") {
    return (
      <div className="flex-1 min-h-0">
        <PRTabView agentId={agent.id} onAddComment={() => {}} />
      </div>
    )
  }
  if (activeTab === "diff-browser") {
    return (
      <div className="flex-1 min-h-0">
        <StackedDiffView
          agentId={agent.id}
          fileChanges={agent.fileChanges}
          search=""
          showFileList
          onOpenFile={() => {}}
          onAddComment={onAddComment}
          pendingComments={pendingComments}
          onRemoveComment={onRemoveComment}
        />
      </div>
    )
  }
  if (activeTab === "file" && openFileTab && openFileTab.type !== "diff-browser") {
    return (
      <div className="flex-1 min-h-0">
        {openFileTab.type === "diff" ? (
          <DiffView
            agentId={agent.id}
            file={openFileTab.file as FileChange}
            onAddComment={onAddComment}
            pendingComments={pendingComments}
            onRemoveComment={onRemoveComment}
          />
        ) : openFileTab.type === "content" ? (
          <FileContentView agentId={agent.id} filePath={openFileTab.path} />
        ) : null}
      </div>
    )
  }
  return null
}
