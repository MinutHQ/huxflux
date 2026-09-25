import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useMatchRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  api,
  queryKeys,
  useAgents,
  useHuxfluxMutation,
  useRepos,
  type AgentSummary,
} from "@huxflux/shared"
import { useWorkspaceContext } from "@/app-shell/workspace"
import { deleteAgent } from "./useAgentLifecycle"

/**
 * Subscribes to the two agent-level window events the root route's global key
 * listener fires:
 *
 * - `huxflux:agent-done` (⌘⇧D) sets the open agent's status to "done".
 * - `huxflux:archive-agent` (⌘⇧⌫) asks for confirmation in a toast, then runs
 *   the same delete flow as the row context menu (worktree teardown included).
 *
 * Both act on the agent the route currently shows — not the hovered row and
 * not the active chat tab, which may be a thread child. With no agent open the
 * chords do nothing.
 *
 * Handlers are read through a ref so the listeners bind once per mount instead
 * of re-subscribing on every render.
 */
export function useAgentShortcuts() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const workspace = useWorkspaceContext()
  const matchRoute = useMatchRoute()
  const { data: agents = [] } = useAgents()
  const { data: repos = [] } = useRepos()

  const match = matchRoute({ to: "/agent/$agentId", fuzzy: false }) as { agentId: string } | false
  const agent = match ? agents.find((a) => a.id === match.agentId) : undefined

  const markDoneMut = useHuxfluxMutation<unknown, AgentSummary>({
    mutationFn: (target) => api.agents.update(target.id, { status: "done" }),
    onSuccess: (_data, target) => {
      queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
        old ? old.map((a) => a.id === target.id ? { ...a, status: "done" as const } : a) : old
      )
      toast.success(`Marked "${target.title}" as done`)
    },
    onError: (err) => toast.error(`Could not mark as done: ${err.message}`),
  })

  const latest = useRef({ agent, repos, queryClient, navigate, workspace, markDoneMut })
  useEffect(() => { latest.current = { agent, repos, queryClient, navigate, workspace, markDoneMut } })

  useEffect(() => {
    function onMarkDone() {
      const target = latest.current.agent
      if (!target) return
      if (target.status === "done") {
        toast.info(`"${target.title}" is already done`)
        return
      }
      latest.current.markDoneMut.mutate(target)
    }

    function onArchive() {
      const target = latest.current.agent
      if (!target) return
      // Archiving deletes the worktree, so the chord only arms the action —
      // the toast button is what actually tears it down. Keyed by agent id so
      // repeat presses replace the prompt instead of stacking toasts.
      toast(`Archive "${target.title}"?`, {
        id: `archive-agent-${target.id}`,
        description: "This deletes the workspace and its worktree.",
        duration: 10_000,
        action: {
          label: "Archive",
          onClick: () => {
            const { repos: r, queryClient: qc, navigate: nav, workspace: ws } = latest.current
            deleteAgent({ agent: target, repos: r, queryClient: qc, navigate: nav, workspace: ws })
          },
        },
        cancel: { label: "Cancel", onClick: () => { /* dismiss only */ } },
      })
    }

    window.addEventListener("huxflux:agent-done", onMarkDone)
    window.addEventListener("huxflux:archive-agent", onArchive)
    return () => {
      window.removeEventListener("huxflux:agent-done", onMarkDone)
      window.removeEventListener("huxflux:archive-agent", onArchive)
    }
  }, [])
}
