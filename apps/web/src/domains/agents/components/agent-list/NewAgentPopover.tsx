import React, { useState } from "react"
import * as TablerIcons from "@tabler/icons-react"
import { IconFolder } from "@tabler/icons-react"
import { AnchoredPopover, cn } from "@huxflux/ui"
import { useRepos } from "@huxflux/shared"
import { randomBeeName, repoColor } from "../../agentListUtils"

interface NewAgentPopoverProps {
  onClose: () => void
  onSelect: (repoId: string, title: string, branch: string, direct: boolean) => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * Floating menu opened by the "+" button in the agents header. Lists repos and
 * lets the user toggle between worktree mode (default) and direct mode (no
 * worktree). On selection it generates a random bee-name → branch and emits
 * `onSelect` so the parent can fire the create-agent API call.
 *
 * Folder-type repos have no git branch and are always created with the `local`
 * sentinel branch in direct mode (worktrees don't apply to non-git folders).
 * The worktree/direct toggle is hidden when every visible repo is a folder.
 *
 * Number keys 1-9 are mapped to the first 9 repos so power users can spawn an
 * agent without leaving the keyboard.
 */
export function NewAgentPopover({ onClose, onSelect, anchorRef }: NewAgentPopoverProps) {
  const [direct, setDirect] = useState(false)
  const { data: repos = [] } = useRepos()
  const hasGitRepo = repos.some((r) => r.type !== "folder")

  function handleSelectRepo(repoId: string) {
    const name = randomBeeName()
    const repo = repos.find((r) => r.id === repoId)
    if (repo?.type === "folder") {
      onSelect(repoId, name, "local", true)
      return
    }
    const prefix = repo?.branchPrefix ? repo.branchPrefix.replace(/\/$/, "") + "/" : "agent/"
    const branch = `${prefix}${name}`
    onSelect(repoId, name, branch, direct)
  }

  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      onClose={onClose}
      placement="bottom-end"
      offset={6}
      className="w-56 overflow-hidden"
      onKeyDown={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
          const idx = parseInt(e.key) - 1
          if (idx < repos.length) handleSelectRepo(repos[idx].id)
        }
      }}
    >
      {repos.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/50">
          No repositories yet.<br />Add one in Settings first.
        </div>
      ) : (
        <>
          {hasGitRepo && (
            <div className="flex items-center gap-1 p-1 border-b border-border">
              <button
                onClick={() => setDirect(false)}
                className={cn(
                  "flex-1 text-[11px] font-medium py-1 rounded-md transition-colors",
                  !direct ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Worktree
              </button>
              <button
                onClick={() => setDirect(true)}
                className={cn(
                  "flex-1 text-[11px] font-medium py-1 rounded-md transition-colors",
                  direct ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Direct
              </button>
            </div>
          )}
          <div className="p-1 space-y-0.5">
            {repos.map((r, i) => {
              const shortcut = i < 9 ? i + 1 : null
              const isFolder = r.type === "folder"
              return (
                <button
                  key={r.id}
                  autoFocus={i === 0}
                  onClick={() => handleSelectRepo(r.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors hover:bg-accent/60 text-foreground"
                >
                  <span className={cn("w-5 h-5 rounded border text-[10px] font-bold flex items-center justify-center shrink-0", repoColor(r.name))}>
                    {(() => {
                      if (isFolder) return <IconFolder size={11} />
                      const tablerIcons = TablerIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>
                      const IconComp = r.icon ? tablerIcons[r.icon] : undefined
                      return IconComp ? <IconComp size={11} /> : r.name[0].toUpperCase()
                    })()}
                  </span>
                  <span className="text-[12px] font-medium flex-1 truncate">
                    {r.name}
                  </span>
                  {shortcut && (
                    <span className="text-[11px] text-muted-foreground/40 font-mono tabular-nums shrink-0">
                      {shortcut}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </AnchoredPopover>
  )
}
