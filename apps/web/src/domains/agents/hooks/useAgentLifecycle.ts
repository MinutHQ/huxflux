import type { QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  api,
  markAgentDeleted,
  queryKeys,
  type AgentSummary,
  type AgentStatus,
  type Repo,
} from "@huxflux/shared"
import { useWorkspaceContext } from "@/app-shell/workspace"
import { getWorktreeDuration, saveWorktreeDuration } from "../agentListUtils"

type NavigateFn = ReturnType<typeof useNavigate>
type WorkspaceCtx = ReturnType<typeof useWorkspaceContext>

interface UseAgentLifecycleArgs {
  /** All visible agents (used for archive-all per status). */
  grouped: Record<AgentStatus, AgentSummary[]>
  /** Looked up for repoName when computing the create-progress placeholder. */
  repos: Repo[]
}

/**
 * Wraps the three multi-step agent mutations (create, delete, archive-all) so
 * the sidebar orchestrator stays a thin component.
 *
 * All three mutations write to TanStack Query optimistically with prefix
 * matching (`{ queryKey: queryKeys.agents.all }`) — the `useAgents` cache key is
 * `queryKeys.agents.list(serverUrl)`, so an exact write would miss. The server's WS
 * broadcast reconciles afterwards.
 */
export function useAgentLifecycle({ grouped, repos }: UseAgentLifecycleArgs) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const workspace = useWorkspaceContext()

  return {
    handleCreateAgent: (repoId: string, title: string, branch: string, direct: boolean, existingBranch?: boolean) =>
      createAgent({ repoId, title, branch, direct, existingBranch, repos, queryClient, navigate, workspace }),
    handleDeleteAgent: (agent: AgentSummary) =>
      deleteAgent({ agent, repos, queryClient, navigate, workspace }),
    handleArchiveAll: (status: AgentStatus) =>
      archiveAll({ status, grouped, queryClient }),
    pendingAgent: workspace.pendingAgent,
  }
}

interface CreateAgentArgs {
  repoId: string
  title: string
  branch: string
  direct: boolean
  existingBranch?: boolean
  repos: Repo[]
  queryClient: QueryClient
  navigate: NavigateFn
  workspace: WorkspaceCtx
}

async function createAgent({ repoId, title, branch, direct, existingBranch, repos, queryClient, navigate, workspace }: CreateAgentArgs) {
  const { onAgentCreating, onAgentCreated, clearPendingAgent } = workspace
  const repoName = repos.find(r => r.id === repoId)?.name ?? ""
  const savedMs = getWorktreeDuration(repoId)
  onAgentCreating({ title, branch, repoName, estimatedMs: savedMs })
  navigate({ to: "/agent/setup" })
  const t0 = Date.now()
  try {
    // fire-and-forget; intentional: agent-create has a multi-step optimistic flow (pending state, cache seed, navigation) that doesn't fit useHuxfluxMutation
    // eslint-disable-next-line no-restricted-syntax
    const agent = await api.agents.create({
      title,
      branch,
      repoId,
      noWorktree: direct || undefined,
      existingBranch: existingBranch || undefined,
    })
    saveWorktreeDuration(repoId, Date.now() - t0)
    // Pre-seed the cache so the agent view doesn't flash HomeView
    queryClient.setQueryData(queryKeys.agents.detail(agent.id), {
      ...agent,
      messages: [],
      fileChanges: [],
      terminalOutput: [],
    })
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
    onAgentCreated(agent.id)
    navigate({ to: "/agent/$agentId", params: { agentId: agent.id } })
  } catch (err) {
    const msg = (err as Error).message || "Failed to create agent"
    // Abort errors mean timeout — the server may still be creating the workspace
    if (/abort/i.test(msg)) {
      toast.info("Workspace is still being set up. It will appear when ready.")
    } else {
      toast.error(msg)
      clearPendingAgent()
      navigate({ to: "/" })
    }
  }
}

interface DeleteAgentArgs {
  agent: AgentSummary
  repos: Repo[]
  queryClient: QueryClient
  navigate: NavigateFn
  workspace: WorkspaceCtx
}

function deleteAgent({ agent, repos, queryClient, navigate, workspace }: DeleteAgentArgs) {
  const { onAgentDeleting, clearDeletingAgent } = workspace
  const repoName = agent.repoId ? (repos.find(r => r.id === agent.repoId)?.name ?? "") : ""
  onAgentDeleting(agent.id, { title: agent.title, branch: agent.branch, repoName })
  navigate({ to: "/agent/teardown" })
  // Tombstone the id so a late `agent:updated` event can't resurrect it
  // before the server's `agent:deleted` broadcast arrives.
  markAgentDeleted(agent.id)
  // Optimistically remove from sidebar immediately.
  // Use setQueriesData with prefix matching because useAgents keys its
  // query as queryKeys.agents.list(serverUrl) — an exact queryKeys.agents.all write would miss.
  queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
    old ? old.filter((a) => a.id !== agent.id) : old
  )
  // Fire API in background — don't block the UI
  api.agents.delete(agent.id).catch((err) =>
    toast.error(`Delete failed: ${err instanceof Error ? err.message : "unknown"}`)
  )
  // Clear animation after it finishes
  setTimeout(() => { clearDeletingAgent(); navigate({ to: "/" }) }, 1500)
}

interface ArchiveAllArgs {
  status: AgentStatus
  grouped: Record<AgentStatus, AgentSummary[]>
  queryClient: QueryClient
}

function archiveAll({ status, grouped, queryClient }: ArchiveAllArgs) {
  const targets = (grouped[status] ?? [])
  if (targets.length === 0) return
  const ids = targets.map((a) => a.id)
  // Optimistically remove all from sidebar
  for (const id of ids) markAgentDeleted(id)
  queryClient.setQueriesData<AgentSummary[]>({ queryKey: queryKeys.agents.all }, (old) =>
    old ? old.filter((a) => !ids.includes(a.id)) : old
  )
  // Delete sequentially to avoid abort errors
  toast.success(`Archiving ${targets.length} agent${targets.length !== 1 ? "s" : ""}...`)
  void (async () => {
    for (const id of ids) {
      try {
        // fire-and-forget; intentional: sequential bulk-delete after optimistic UI removal
        // eslint-disable-next-line no-restricted-syntax
        await api.agents.delete(id)
      } catch (err) {
        if (/abort/i.test(String(err))) continue
        toast.error(`Archive failed: ${err instanceof Error ? err.message : "unknown"}`)
      }
    }
  })()
}
