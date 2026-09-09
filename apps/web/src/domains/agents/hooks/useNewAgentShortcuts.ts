import { useEffect, useRef } from "react"
import type { Repo } from "@huxflux/shared"
import { buildNewAgentArgs } from "../agentListUtils"

interface UseNewAgentShortcutsArgs {
  /** Repos in sidebar order; index N-1 is what ⌘N creates an agent for. */
  repos: Repo[]
  /** ⌘N: open the repo picker popover. */
  onOpenPicker: () => void
  /** ⌘1-9: create an agent right away for the repo at that position. */
  onCreate: (repoId: string, title: string, branch: string, direct: boolean) => void
}

/**
 * Subscribes to the two window events the root route's global key listener
 * fires for agent creation:
 *
 * - `huxflux:new-agent` (⌘N) opens the "+" popover.
 * - `huxflux:new-agent-for-repo` (⌘1-9) carries `{ index }` and immediately
 *   creates a worktree agent for `repos[index]`, using the same title/branch
 *   derivation as the popover. Out-of-range indices are ignored.
 *
 * Handlers are read through a ref so the listeners bind once per mount instead
 * of re-subscribing every time the parent re-renders with fresh closures.
 */
export function useNewAgentShortcuts({ repos, onOpenPicker, onCreate }: UseNewAgentShortcutsArgs) {
  const latest = useRef({ repos, onOpenPicker, onCreate })
  useEffect(() => { latest.current = { repos, onOpenPicker, onCreate } })

  useEffect(() => {
    function onNewAgent() { latest.current.onOpenPicker() }
    function onNewAgentForRepo(e: Event) {
      const index = (e as CustomEvent<{ index: number }>).detail?.index
      if (typeof index !== "number") return
      const repo = latest.current.repos[index]
      if (!repo) return
      const args = buildNewAgentArgs(repo, false)
      latest.current.onCreate(repo.id, args.title, args.branch, args.direct)
    }
    window.addEventListener("huxflux:new-agent", onNewAgent)
    window.addEventListener("huxflux:new-agent-for-repo", onNewAgentForRepo)
    return () => {
      window.removeEventListener("huxflux:new-agent", onNewAgent)
      window.removeEventListener("huxflux:new-agent-for-repo", onNewAgentForRepo)
    }
  }, [])
}
