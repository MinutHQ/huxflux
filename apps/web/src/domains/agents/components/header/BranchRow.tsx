import { useState } from "react"
import { IconGitBranch, IconFolder } from "@tabler/icons-react"
import { api, type Agent, type Repo, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BranchPicker } from "./BranchPicker"

interface BranchRowProps {
  agent: Agent
  repo: Repo | undefined
}

/** Inline branch line under the agent title: current branch + base branch (both pickable). */
export function BranchRow({ agent, repo }: BranchRowProps) {
  const queryClient = useQueryClient()
  const [branchOpen, setBranchOpen] = useState(false)
  const [baseOpen, setBaseOpen] = useState(false)

  // Folder-type repos don't have branches; show the path instead.
  const isGitRepo = repo?.type !== "folder" && agent.branch !== "local"

  const { data: repoBranches = [] } = useHuxfluxQuery({
    queryKey: queryKeys.repos.branches(agent.repoId ?? ""),
    queryFn: () => api.repos.branches(agent.repoId!),
    enabled: isGitRepo && !!agent.repoId && (baseOpen || branchOpen),
    staleTime: 60_000,
  })

  const updateBaseBranch = useHuxfluxMutation<unknown, string>({
    mutationFn: (val) => api.agents.update(agent.id, { baseBranch: val }),
    onSuccess: (_data, val) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => old ? { ...old, baseBranch: val } : old)
    },
  })

  const switchBranch = useHuxfluxMutation<Partial<Agent>, { val: string; force?: boolean }>({
    mutationFn: ({ val, force }) => api.agents.switchBranch(agent.id, val, force || undefined),
    invalidate: () => queryKeys.agents.all,
    onSuccess: (updated) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => old ? { ...old, ...updated } : old)
    },
    onError: (err, { val }) => {
      const message = err instanceof Error ? err.message : ""
      if (message.includes("already checked out")) {
        toast.error(`Branch "${val}" is locked to a stale worktree`, {
          action: { label: "Force remove & retry", onClick: () => switchBranch.mutate({ val, force: true }) },
          duration: 8000,
        })
      } else {
        toast.error(message || "Failed to switch branch")
      }
    },
  })

  if (!isGitRepo) {
    if (!repo) return null
    return (
      <div className="flex items-center gap-1.5">
        <IconFolder size={11} className="text-muted-foreground/40 shrink-0" />
        <span className="text-[11px] text-muted-foreground/60 font-mono truncate max-w-[240px]">{repo.path}</span>
      </div>
    )
  }

  function selectBaseBranch(val: string) {
    if (!val || val === agent.baseBranch) return
    updateBaseBranch.mutate(val)
  }

  function selectBranch(val: string) {
    if (!val || val === agent.branch) return
    switchBranch.mutate({ val })
  }

  const baseLabel = agent.baseBranch ?? repo?.branchFrom ?? "origin/main"

  return (
    <div className="flex items-center gap-1.5">
      <IconGitBranch size={11} className="text-muted-foreground/40 shrink-0" />
      <BranchPicker
        current={agent.branch}
        branches={repoBranches}
        activeValue={agent.branch}
        triggerClassName="text-muted-foreground/60 truncate max-w-[180px]"
        onSelect={selectBranch}
        onOpenChange={setBranchOpen}
      />
      <span className="text-muted-foreground/20 shrink-0">›</span>
      <BranchPicker
        current={baseLabel}
        branches={repoBranches}
        activeValue={baseLabel}
        triggerClassName="text-muted-foreground/40"
        contentClassName="w-56"
        onSelect={selectBaseBranch}
        onOpenChange={setBaseOpen}
      />
    </div>
  )
}
