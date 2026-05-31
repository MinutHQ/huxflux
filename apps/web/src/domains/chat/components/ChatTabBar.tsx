import { useRef, useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import {
  IconFileCode,
  IconGitPullRequest,
  IconPencil,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react"
import { api, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import type { Agent } from "@huxflux/shared"
import type { OpenFile, ChatTab } from "@/app-shell/workspace"
import { CloseTabButton } from "./CloseTabButton"

type ActiveTab = "chat" | "file" | "diff-browser" | "pr"

interface ChatTabBarProps {
  agent: Agent
  tabs: ChatTab[]
  activeTab: ActiveTab
  activeTabId: string | null | undefined
  openFileTab: OpenFile | null
  onTabSelect?: (agentId: string) => void
  onTabClose?: (agentId: string) => void
  onTabTitleChange?: (agentId: string, title: string) => void
  onNewTab?: () => void
  onSetActiveTab: (tab: ActiveTab) => void
  onCloseFileTab: () => void
}

function useTitleEdit(agent: Agent, onTabTitleChange?: (agentId: string, title: string) => void) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const renameMut = useHuxfluxMutation<unknown, string>({
    mutationFn: (title) => api.agents.update(agent.id, { title }),
    invalidate: () => queryKeys.agents.all,
    onSuccess: (_data, title) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => old ? { ...old, title } : old)
      onTabTitleChange?.(agent.id, title)
    },
  })

  function commit() {
    const title = draft.trim()
    setEditing(false)
    if (!title || title === agent.title) return
    renameMut.mutate(title)
  }

  return { editing, draft, setDraft, setEditing, inputRef, commit }
}

interface MultiTabItemProps {
  tab: ChatTab
  isActive: boolean
  isEditing: boolean
  draft: string
  setDraft: (s: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: () => void
  onCommit: () => void
  onCancel: () => void
  onStartEditing: () => void
  onClose?: () => void
}

function MultiTabItem({ tab, isActive, isEditing, draft, setDraft, inputRef, onSelect, onCommit, onCancel, onStartEditing, onClose }: MultiTabItemProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer shrink-0",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
      )}
    >
      <IconSparkles size={12} className="shrink-0" />
      {isEditing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit() }
            if (e.key === "Escape") onCancel()
          }}
          onBlur={onCommit}
          className="bg-background border border-ring rounded px-1.5 py-0.5 outline-none text-foreground w-40"
        />
      ) : (
        <span>{tab.title.length > 24 ? tab.title.slice(0, 24) + "…" : tab.title}</span>
      )}
      {isActive && !isEditing && (
        <button
          onClick={(e) => { e.stopPropagation(); onStartEditing() }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground transition-all"
        >
          <IconPencil size={11} />
        </button>
      )}
      {tab.isChild && onClose && <CloseTabButton onConfirm={onClose} />}
    </div>
  )
}

interface FileTabButtonProps {
  active: boolean
  label: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
  onClose: () => void
}

function FileTabButton({ active, label, icon, onClick, onClose }: FileTabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
        active ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="ml-1 text-muted-foreground/40 hover:text-foreground transition-colors"
      >
        <IconX size={11} />
      </span>
    </button>
  )
}

function getFileTabLabel(openFileTab: OpenFile): string {
  if (openFileTab.type === "diff") return openFileTab.file.path.split("/").pop() ?? ""
  if (openFileTab.type === "content") return openFileTab.path.split("/").pop() ?? ""
  return ""
}

export function ChatTabBar({
  agent,
  tabs,
  activeTab,
  activeTabId,
  openFileTab,
  onTabSelect,
  onTabClose,
  onTabTitleChange,
  onNewTab,
  onSetActiveTab,
  onCloseFileTab,
}: ChatTabBarProps) {
  const { editing, draft, setDraft, setEditing, inputRef, commit } = useTitleEdit(agent, onTabTitleChange)

  return (
    <div className="relative flex items-center shrink-0 px-2 pb-1.5 pt-1 overflow-x-auto gap-1">
      <div className="absolute inset-0 bg-gradient-to-b from-primary-foreground/[0.04] to-transparent pointer-events-none" />
      {tabs.length > 1 ? (
        tabs.map((tab) => {
          const isActive = tab.agentId === activeTabId && activeTab === "chat"
          const isEditingThis = editing && tab.agentId === activeTabId
          return (
            <MultiTabItem
              key={tab.agentId}
              tab={tab}
              isActive={isActive}
              isEditing={isEditingThis}
              draft={draft}
              setDraft={setDraft}
              inputRef={inputRef}
              onSelect={() => { onTabSelect?.(tab.agentId); onSetActiveTab("chat") }}
              onCommit={() => void commit()}
              onCancel={() => setEditing(false)}
              onStartEditing={() => { setDraft(tab.title); setEditing(true) }}
              onClose={onTabClose ? () => onTabClose(tab.agentId) : undefined}
            />
          )
        })
      ) : (
        <div
          onClick={() => onSetActiveTab("chat")}
          className={cn(
            "group flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "chat" ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
          )}
        >
          <IconSparkles size={12} className="shrink-0" />
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void commit() }
                if (e.key === "Escape") setEditing(false)
              }}
              onBlur={() => void commit()}
              className="bg-background border border-ring rounded px-1.5 py-0.5 outline-none text-foreground w-48"
            />
          ) : (
            <span>{agent.title.length > 32 ? agent.title.slice(0, 32) + "…" : agent.title}</span>
          )}
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); setDraft(agent.title); setEditing(true) }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground transition-all ml-1"
            >
              <IconPencil size={11} />
            </button>
          )}
        </div>
      )}

      {openFileTab?.type === "diff-browser" && (
        <FileTabButton
          active={activeTab === "diff-browser"}
          label="All changes"
          icon={<IconFileCode size={12} />}
          onClick={() => onSetActiveTab("diff-browser")}
          onClose={onCloseFileTab}
        />
      )}
      {openFileTab?.type === "pr" && (
        <FileTabButton
          active={activeTab === "pr"}
          label="Pull request"
          icon={<IconGitPullRequest size={12} />}
          onClick={() => onSetActiveTab("pr")}
          onClose={onCloseFileTab}
        />
      )}
      {openFileTab && openFileTab.type !== "diff-browser" && openFileTab.type !== "pr" && (
        <FileTabButton
          active={activeTab === "file"}
          label={getFileTabLabel(openFileTab)}
          icon={<IconFileCode size={12} />}
          onClick={() => onSetActiveTab("file")}
          onClose={onCloseFileTab}
        />
      )}

      <button
        onClick={onNewTab}
        className="ml-1 p-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
        title="New agent in same worktree"
      >
        <IconPlus size={13} />
      </button>
    </div>
  )
}
