import { useEffect } from "react"
import { IconX, IconGitPullRequest, IconFiles, IconMaximize } from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import { DiffView } from "@/components/DiffView"
import { FileContentView } from "@/components/FileContentView"
import { ChangesView } from "@/components/ChangesView"
import { StackedDiffView, PRView } from "@/components/FileChangesView"
import { getBuiltInSpriteSheet } from "@pierre/trees"
import type { OpenFile, FileTab } from "@/hooks/useWorkspace"
import type { FileChange, PRComment } from "@/data/mock"

// Inject the sprite sheet once into the document
let spriteInjected = false
function ensureSpriteSheet() {
  if (spriteInjected) return
  spriteInjected = true
  const div = document.createElement("div")
  div.style.position = "absolute"
  div.style.width = "0"
  div.style.height = "0"
  div.style.overflow = "hidden"
  div.innerHTML = getBuiltInSpriteSheet("complete")
  document.body.appendChild(div)
}

// Map file extensions to built-in sprite IDs
const EXT_TO_ICON: Record<string, string> = {
  ts: "file-tree-builtin-typescript",
  tsx: "file-tree-builtin-react",
  js: "file-tree-builtin-javascript",
  jsx: "file-tree-builtin-react",
  json: "file-tree-builtin-json",
  css: "file-tree-builtin-css",
  scss: "file-tree-builtin-css",
  html: "file-tree-builtin-html",
  md: "file-tree-builtin-markdown",
  mdx: "file-tree-builtin-markdown",
  py: "file-tree-builtin-python",
  rs: "file-tree-builtin-rust",
  go: "file-tree-builtin-go",
  rb: "file-tree-builtin-ruby",
  sh: "file-tree-builtin-bash",
  bash: "file-tree-builtin-bash",
  zsh: "file-tree-builtin-bash",
  sql: "file-tree-builtin-database",
  svg: "file-tree-builtin-image",
  png: "file-tree-builtin-image",
  jpg: "file-tree-builtin-image",
  gif: "file-tree-builtin-image",
  yaml: "file-tree-builtin-text",
  yml: "file-tree-builtin-text",
  toml: "file-tree-builtin-text",
  vue: "file-tree-builtin-vue",
  svelte: "file-tree-builtin-svelte",
  swift: "file-tree-builtin-swift",
  c: "file-tree-builtin-c",
  cpp: "file-tree-builtin-cpp",
  lock: "file-tree-builtin-text",
}

const EXT_TO_COLOR: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#61dafb",
  js: "#f0db4f",
  jsx: "#61dafb",
  json: "#cbcb41",
  css: "#563d7c",
  scss: "#c6538c",
  html: "#e34c26",
  md: "#519aba",
  mdx: "#519aba",
  py: "#3572a5",
  rs: "#dea584",
  go: "#00add8",
  rb: "#cc342d",
  sh: "#89e051",
  bash: "#89e051",
  sql: "#e38c00",
  svg: "#ffb13b",
  vue: "#41b883",
  svelte: "#ff3e00",
  swift: "#f05138",
  c: "#555555",
  cpp: "#f34b7d",
}

function FileIcon({ fileName, size = 14 }: { fileName: string; size?: number }) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  const iconId = EXT_TO_ICON[ext] ?? "file-tree-builtin-default"
  const color = EXT_TO_COLOR[ext] ?? "currentColor"
  return (
    <svg width={size} height={size} className="shrink-0" style={{ color }}>
      <use href={`#${iconId}`} />
    </svg>
  )
}

function tabLabel(file: OpenFile): string {
  if (file.type === "diff") return file.file.path.split("/").pop() ?? "Diff"
  if (file.type === "content") return file.path.split("/").pop() ?? "File"
  if (file.type === "changes") return "Changes"
  if (file.type === "diff-browser") return "All changes"
  if (file.type === "pr") return "Pull request"
  return "File"
}

function tabTooltip(file: OpenFile): string {
  if (file.type === "diff") return file.file.path
  if (file.type === "content") return file.path
  if (file.type === "changes") return "All file changes"
  if (file.type === "diff-browser") return "All file changes"
  if (file.type === "pr") return "Pull request"
  return ""
}

function TabIcon({ file }: { file: OpenFile }) {
  if (file.type === "pr") return <IconGitPullRequest size={12} className="shrink-0" />
  if (file.type === "changes" || file.type === "diff-browser") return <IconFiles size={12} className="shrink-0" />
  const name = file.type === "diff" ? file.file.path.split("/").pop() ?? "" : file.type === "content" ? file.path.split("/").pop() ?? "" : ""
  return <FileIcon fileName={name} size={14} />
}

interface FileViewerPanelProps {
  agentId: string
  tabs: FileTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseAll: () => void
  onMaximize?: () => void
  fileChanges?: FileChange[]
  onAddComment?: (c: PRComment) => void
  pendingComments?: PRComment[]
  onRemoveComment?: (id: string) => void
}

export function FileViewerPanel({ agentId, tabs, activeTabId, onSelectTab, onCloseTab, onCloseAll, onMaximize, fileChanges = [], onAddComment, pendingComments, onRemoveComment }: FileViewerPanelProps) {
  const activeTab = tabs.find(t => t.id === activeTabId)
  const openFile = activeTab?.file ?? null

  useEffect(() => { ensureSpriteSheet() }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar — matches ChatView tab pattern */}
      <div className="relative flex items-center shrink-0 px-2 pb-1.5 pt-1 gap-1">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-foreground/[0.04] to-transparent pointer-events-none" />
        {/* Scrollable tabs */}
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const filePath = tab.file.type === "diff" ? tab.file.file.path : tab.file.type === "content" ? tab.file.path : null
          const change = filePath ? fileChanges.find(f => f.path === filePath) : null
          const statusColor = change
            ? change.deletions === 0 ? "text-emerald-400" : change.additions === 0 ? "text-red-400" : "text-amber-400"
            : null
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              title={tabTooltip(tab.file)}
              className={cn(
                "group flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer shrink-0",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
              )}
            >
              <TabIcon file={tab.file} />
              <span className={cn(statusColor)}>{tabLabel(tab.file)}</span>
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-all"
              >
                <IconX size={11} />
              </span>
            </div>
          )
        })}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 z-10">
          {onMaximize && (
            <button onClick={onMaximize} className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors" title="Full size (F1)">
              <IconMaximize size={13} />
            </button>
          )}
          <button onClick={onCloseAll} className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors" title="Close all">
            <IconX size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {openFile?.type === "diff" ? (
          <DiffView agentId={agentId} file={openFile.file} onAddComment={onAddComment} pendingComments={pendingComments} onRemoveComment={onRemoveComment} />
        ) : openFile?.type === "content" ? (
          <FileContentView agentId={agentId} filePath={openFile.path} onAddComment={onAddComment} pendingComments={pendingComments} onRemoveComment={onRemoveComment} />
        ) : openFile?.type === "changes" ? (
          <ChangesView
            agentId={agentId}
            fileChanges={fileChanges}
            scrollToPath={openFile.scrollToPath}
            onAddComment={onAddComment}
            pendingComments={pendingComments}
            onRemoveComment={onRemoveComment}
          />
        ) : openFile?.type === "diff-browser" ? (
          <StackedDiffView
            agentId={agentId}
            fileChanges={fileChanges}
            search=""
            showFileList
            onOpenFile={() => {}}
            onAddComment={onAddComment}
            pendingComments={pendingComments}
            onRemoveComment={onRemoveComment}
          />
        ) : openFile?.type === "pr" && onAddComment ? (
          <PRView agentId={agentId} onAddComment={onAddComment} />
        ) : null}
      </div>
    </div>
  )
}
