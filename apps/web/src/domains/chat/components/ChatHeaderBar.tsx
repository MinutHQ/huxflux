import { useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import type { Agent } from "@huxflux/shared"
import { IconEye, IconGitBranch } from "@tabler/icons-react"
import { BranchPicker } from "./BranchPicker"
import { OpenInPopover } from "./OpenInPopover"
import { PRStatusPill } from "./PRStatusPill"

interface ChatHeaderBarProps {
  agent: Agent
  repoName?: string
  isStreaming: boolean
  githubEnabled: boolean
  remoteMode: boolean
  lastOpenInApp: string
  detectedEditors: string[]
  sshConfigured: boolean | null
  onOpenIn: (appKey: string) => void
  onOpenSshSetup: () => void
  onSendMessage: (msg: string) => void
  onNewTabWithMessage?: (msg: string) => void
}

const DEFAULT_REVIEW_PROMPT =
  "Review the changes you've made. Look for bugs, security issues, performance problems, and code quality. Be thorough but concise."

async function loadReviewPrompt(): Promise<string> {
  try {
    // fire-and-forget; intentional: one-off read used by a click handler, not a render-time query
    // eslint-disable-next-line no-restricted-syntax
    const settings = await api.settings.current() as { reviewPrompt?: string }
    return settings.reviewPrompt?.trim() || DEFAULT_REVIEW_PROMPT
  } catch {
    return DEFAULT_REVIEW_PROMPT
  }
}

function HeaderActions({
  agent,
  githubEnabled,
  isStreaming,
  onSendMessage,
  onNewTabWithMessage,
}: {
  agent: Agent
  githubEnabled: boolean
  isStreaming: boolean
  onSendMessage: (msg: string) => void
  onNewTabWithMessage?: (msg: string) => void
}) {
  const handleCreatePR = () => {
    const msg = "Please create a pull request for the changes you've made. Write a clear title and description."
    onSendMessage(msg)
  }
  const handleReview = async () => {
    if (!onNewTabWithMessage) return
    onNewTabWithMessage(await loadReviewPrompt())
  }
  return (
    <>
      {githubEnabled && agent.prStatus && (
        <PRStatusPill prStatus={agent.prStatus} agentId={agent.id} />
      )}
      {githubEnabled && !agent.prStatus && !isStreaming && agent.messages.length > 0 && (
        <button
          onClick={handleCreatePR}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border hover:bg-accent transition-colors text-[11px] text-muted-foreground"
        >
          Create PR
        </button>
      )}
      {!isStreaming && agent.messages.length > 0 && onNewTabWithMessage && (
        <button
          onClick={handleReview}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary border border-border hover:bg-accent transition-colors text-[11px] text-muted-foreground"
        >
          <IconEye size={11} />
          Review
        </button>
      )}
    </>
  )
}

export function ChatHeaderBar({
  agent,
  repoName,
  isStreaming,
  githubEnabled,
  remoteMode,
  lastOpenInApp,
  detectedEditors,
  sshConfigured,
  onOpenIn,
  onOpenSshSetup,
  onSendMessage,
  onNewTabWithMessage,
}: ChatHeaderBarProps) {
  const queryClient = useQueryClient()
  const [baseBranchOpen, setBaseBranchOpen] = useState(false)
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)

  const { data: repoBranches = [] } = useHuxfluxQuery({
    queryKey: queryKeys.repos.branches(agent.repoId ?? ""),
    queryFn: () => api.repos.branches(agent.repoId!),
    enabled: !!agent.repoId && (baseBranchOpen || branchPickerOpen),
    staleTime: 60_000,
  })

  const updateBaseBranch = useHuxfluxMutation<unknown, string>({
    mutationFn: (val) => api.agents.update(agent.id, { baseBranch: val }),
    onSuccess: (_data, val) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => old ? { ...old, baseBranch: val } : old)
    },
  })

  const switchBranchMut = useHuxfluxMutation<Partial<Agent>, { val: string; force?: boolean }>({
    mutationFn: ({ val, force }) => api.agents.switchBranch(agent.id, val, force || undefined),
    invalidate: () => queryKeys.agents.all,
    onSuccess: (updated) => {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => old ? { ...old, ...updated } : old)
    },
    onError: (err, { val }) => {
      const message = err instanceof Error ? err.message : ""
      if (message.includes("already checked out")) {
        toast.error(`Branch "${val}" is locked to a stale worktree`, {
          action: { label: "Force remove & retry", onClick: () => switchBranchMut.mutate({ val, force: true }) },
          duration: 8000,
        })
      } else {
        toast.error(message || "Failed to switch branch")
      }
    },
  })

  function selectBaseBranch(val: string) {
    setBaseBranchOpen(false)
    if (!val || val === agent.baseBranch) return
    updateBaseBranch.mutate(val)
  }

  function selectBranch(val: string) {
    setBranchPickerOpen(false)
    if (!val || val === agent.branch) return
    switchBranchMut.mutate({ val })
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      {repoName && (
        <>
          <span className="text-[12px] text-muted-foreground/50 font-medium truncate shrink-0 max-w-[120px]">{repoName}</span>
          <span className="text-muted-foreground/30 shrink-0">/</span>
        </>
      )}
      <IconGitBranch size={13} className="text-muted-foreground/50 shrink-0" />
      <BranchPicker
        currentBranch={agent.branch}
        branches={repoBranches}
        buttonClassName="text-[12px] text-muted-foreground font-mono hover:text-foreground transition-colors flex items-center gap-1 truncate max-w-[200px]"
        buttonTitle="Click to change branch"
        open={branchPickerOpen}
        onOpenChange={setBranchPickerOpen}
        onSelect={(b) => void selectBranch(b)}
      />
      <span className="text-muted-foreground/30 shrink-0">›</span>
      <BranchPicker
        currentBranch={agent.baseBranch ?? "origin/main"}
        branches={repoBranches}
        buttonClassName="text-[12px] text-muted-foreground/60 font-mono hover:text-foreground transition-colors flex items-center gap-1"
        buttonTitle="Click to change base branch"
        open={baseBranchOpen}
        onOpenChange={setBaseBranchOpen}
        onSelect={(b) => void selectBaseBranch(b)}
      />
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <HeaderActions
          agent={agent}
          githubEnabled={githubEnabled}
          isStreaming={isStreaming}
          onSendMessage={onSendMessage}
          onNewTabWithMessage={onNewTabWithMessage}
        />
        <OpenInPopover
          agentId={agent.id}
          location={agent.location}
          lastOpenInApp={lastOpenInApp}
          remoteMode={remoteMode}
          detectedEditors={detectedEditors}
          sshConfigured={sshConfigured}
          onSelect={onOpenIn}
          onOpenSshSetup={onOpenSshSetup}
        />
      </div>
    </div>
  )
}
