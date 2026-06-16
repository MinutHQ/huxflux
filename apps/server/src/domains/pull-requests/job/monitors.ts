import type { agents } from "../../agents/agents.db.js"
import type { PRDetails } from "../../../types.js"
import { isAgentRunning } from "../../agent-runner/agent-runner.service.js"
import { logger } from "../../../logger.js"
import { sendToAgent } from "./sendToAgent.js"

// Per-agent state for the PR/CI/merge monitors. Keyed by agent id so multiple
// agents can run side-by-side without their seen-comment / last-conclusion /
// last-mergeable-state sets cross-contaminating.
const lastSeenCommentIds = new Map<string, Set<string>>()
const lastSeenCheckConclusions = new Map<string, string>()
const lastSeenMergeableState = new Map<string, string>()

type AgentRow = typeof agents.$inferSelect

interface NewComment {
  author: string
  body: string
  path?: string
  line?: number
  commentId?: number | string
}

function collectNewComments(
  agent: AgentRow,
  details: PRDetails,
): NewComment[] | "seeded" {
  let seen = lastSeenCommentIds.get(agent.id)
  if (!seen) {
    // First run: seed with all existing comments so we don't replay history
    seen = new Set<string>()
    for (const thread of details.threads) for (const c of thread.comments) seen.add(c.id)
    for (const c of details.issueComments) seen.add(String(c.id))
    lastSeenCommentIds.set(agent.id, seen)
    return "seeded"
  }

  const out: NewComment[] = []
  for (const thread of details.threads) {
    if (thread.isResolved) continue
    for (const c of thread.comments) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      if (c.author === details.author) continue
      out.push({ author: c.author, body: c.body, path: c.path ?? thread.path, line: c.line ?? thread.line, commentId: c.databaseId })
    }
  }
  for (const c of details.issueComments) {
    const cId = String(c.id)
    if (seen.has(cId)) continue
    seen.add(cId)
    if (c.author === details.author) continue
    out.push({ author: c.author, body: c.body, commentId: c.id })
  }
  return out
}

function formatCommentsMessage(comments: NewComment[]): string {
  const parts = comments.map((c) => {
    let prefix = `**${c.author}** commented`
    if (c.path) prefix += ` on \`${c.path}${c.line ? `:${c.line}` : ""}\``
    const idNote = c.commentId ? ` (comment ID: ${c.commentId})` : ""
    return `${prefix}${idNote}:\n> ${c.body.split("\n").join("\n> ")}`
  })
  return `New PR review comment${comments.length > 1 ? "s" : ""}:\n\n${parts.join("\n\n---\n\n")}\n\nPlease address ${comments.length > 1 ? "these comments" : "this comment"}. Fix the code if needed, then reply on GitHub using:\n  <huxflux:pr.reply commentId="COMMENT_ID">your reply</huxflux:pr.reply>`
}

export async function monitorPRComments(agent: AgentRow, details: PRDetails): Promise<void> {
  if (isAgentRunning(agent.id)) return
  try {
    const result = collectNewComments(agent, details)
    if (result === "seeded" || result.length === 0) return
    logger.info({ agentId: agent.id, commentCount: result.length }, "[poller] sending new PR comment(s) to agent")
    await sendToAgent(agent.id, formatCommentsMessage(result), "PR Review")
  } catch (err) {
    logger.warn({ err, agentId: agent.id }, "[poller] PR comment monitor failed")
  }
}

export async function monitorCI(agent: AgentRow, details: PRDetails): Promise<void> {
  if (isAgentRunning(agent.id)) return
  try {
    if (details.checks.length === 0) return
    const allCompleted = details.checks.every((c) => c.status === "completed")
    if (!allCompleted) return

    const failed = details.checks.filter((c) => c.conclusion === "failure")
    const conclusionKey = details.checks.map((c) => `${c.name}:${c.conclusion}`).sort().join(",")
    const lastKey = lastSeenCheckConclusions.get(agent.id)
    if (conclusionKey === lastKey) return
    lastSeenCheckConclusions.set(agent.id, conclusionKey)

    // Skip first run (seeding) and no-failure runs
    if (!lastKey) return
    if (failed.length === 0) return

    const failedNames = failed.map((c) => `- **${c.name}**${c.url ? ` ([view](${c.url}))` : ""}`).join("\n")
    const message = `CI checks failed on your PR:\n\n${failedNames}\n\nPlease investigate and fix the failing checks. If the failure is not related to your changes, explain why.`
    logger.info({ agentId: agent.id, failedChecks: failed.map((c) => c.name) }, "[poller] CI failure detected, notifying agent")
    await sendToAgent(agent.id, message, "CI Monitor")
  } catch (err) {
    logger.warn({ err, agentId: agent.id }, "[poller] CI monitor failed")
  }
}

export async function monitorMergeConflicts(
  agent: AgentRow,
  pr: { mergeableState: string; number: number; url: string },
): Promise<void> {
  if (isAgentRunning(agent.id)) return
  const state = pr.mergeableState
  const lastState = lastSeenMergeableState.get(agent.id)
  lastSeenMergeableState.set(agent.id, state)
  // Skip first run (seeding); only notify when state changes TO dirty
  if (!lastState) return
  if (state !== "dirty" || lastState === "dirty") return
  const message = `Your PR has merge conflicts. The base branch has changed since your last push.\n\nPlease resolve the conflicts:\n1. Rebase your branch onto the latest base branch: \`git fetch origin && git rebase origin/<base-branch>\`\n2. Fix any conflicts\n3. Force push: \`git push --force-with-lease\`\n\nIf the conflicts are complex, explain what files conflict and ask for guidance.`
  logger.info({ agentId: agent.id, prNumber: pr.number }, "[poller] merge conflict detected")
  await sendToAgent(agent.id, message, "Merge Conflict")
}
