import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconGitPullRequest, IconSearch } from "@tabler/icons-react"
import type { FileChangesViewProps } from "../file-changes.types"
import { AgentPRTab } from "./AgentPRTab"
import { UnifiedFileTree } from "./UnifiedFileTree"

type Tab = "files" | "changes" | "pr"

interface FileChangesHeaderProps {
  tab: Tab
  setTab: (tab: Tab) => void
  fileChangesCount: number
  hasPR: boolean
}

function FileChangesHeader({ tab, setTab, fileChangesCount, hasPR }: FileChangesHeaderProps) {
  return (
    <div className="flex items-center px-2 py-2 border-b border-border shrink-0 gap-1">
      <button
        onClick={() => setTab("files")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
          tab === "files"
            ? "bg-accent text-foreground"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
        )}
      >
        All files
      </button>
      <button
        onClick={() => setTab("changes")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
          tab === "changes"
            ? "bg-accent text-foreground"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
        )}
      >
        Changes
        {fileChangesCount > 0 && (
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              tab === "changes" ? "bg-background/60 text-foreground" : "bg-accent/60 text-muted-foreground",
            )}
          >
            {fileChangesCount}
          </span>
        )}
      </button>
      {hasPR && (
        <button
          onClick={() => setTab("pr")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
            tab === "pr"
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
          )}
        >
          <IconGitPullRequest size={12} />
          Pull request
        </button>
      )}
      <button className="ml-auto p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
        <IconSearch size={14} />
      </button>
    </div>
  )
}

/**
 * Top-level "right pane" view that renders the file tree, diff browser, and
 * per-agent PR comments tab. Used by the agent route and (via its sub-pieces)
 * by chat's file/diff/PR tabs.
 */
export function FileChangesView({
  agent,
  onFileContentSelect,
  onAddComment,
  tab: tabProp,
  onTabChange,
  hideHeader,
  onOpenDiffBrowser,
  onOpenPRTab,
}: FileChangesViewProps) {
  const [tabLocal, setTabLocal] = useState<Tab>("files")
  const tab = tabProp ?? tabLocal
  const setTab = onTabChange ?? setTabLocal
  const hasPR = !!agent.prNumber

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {!hideHeader && (
        <FileChangesHeader tab={tab} setTab={setTab} fileChangesCount={agent.fileChanges.length} hasPR={hasPR} />
      )}

      <div className="flex flex-col flex-1 min-h-0">
        <UnifiedFileTree
          agentId={agent.id}
          repoId={agent.repoId ?? null}
          fileChanges={agent.fileChanges}
          onFileContentSelect={onFileContentSelect}
          onOpenDiffBrowser={onOpenDiffBrowser}
          onOpenPRTab={onOpenPRTab}
          hasPR={hasPR}
          prView={<AgentPRTab agentId={agent.id} onAddComment={onAddComment} />}
        />
      </div>
    </div>
  )
}
