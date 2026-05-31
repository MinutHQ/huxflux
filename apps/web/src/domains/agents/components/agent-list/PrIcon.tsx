import * as TablerIcons from "@tabler/icons-react"
import {
  IconFolder,
  IconGitBranch,
  IconGitPullRequest,
  IconGitMerge,
  IconGitPullRequestClosed,
  IconCheck,
} from "@tabler/icons-react"
import type { AgentSummary } from "@huxflux/shared"

/**
 * 11×11 status glyph for the agent's PR. Encodes merged, conflicted, change-requested,
 * clean-ready, draft, and blocked states with distinct icons + colors. For folder
 * repos (no git) and agents on the `local` branch sentinel, falls back to a folder icon.
 */
export function PrIcon({ agent, repoType }: { agent: AgentSummary; repoType?: string }) {
  if (repoType === "folder" || agent.branch === "local") {
    return <IconFolder size={11} className="text-muted-foreground/30 shrink-0" />
  }
  const pr = agent.prStatus
  if (!pr) {
    return <IconGitBranch size={11} className="text-muted-foreground/30 shrink-0" />
  }
  if (pr.merged) {
    return <IconGitMerge size={11} className="text-purple-400/70 shrink-0" />
  }
  if (pr.state === "closed") {
    return <IconGitPullRequestClosed size={11} className="text-red-400/70 shrink-0" />
  }
  if (pr.mergeableState === "dirty") {
    return <TablerIcons.IconAlertTriangle size={11} className="text-red-400/80 shrink-0" />
  }
  if (pr.hasChangeRequests) {
    return <TablerIcons.IconMessageX size={11} className="text-orange-400/80 shrink-0" />
  }
  if (pr.mergeableState === "clean") {
    return <IconCheck size={11} className="text-emerald-400/70 shrink-0" />
  }
  if (pr.draft) {
    return <IconGitPullRequest size={11} className="text-muted-foreground/30 shrink-0" />
  }
  if (pr.state === "open" && !pr.draft) {
    return <TablerIcons.IconShieldX size={11} className="text-yellow-400/70 shrink-0" />
  }
  return <IconGitPullRequest size={11} className="text-muted-foreground/60 shrink-0" />
}
