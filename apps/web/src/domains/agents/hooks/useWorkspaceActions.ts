import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { api, type Agent, type AgentPendingQuestion } from "@huxflux/shared"
import { useWorkspaceContext } from "@/app-shell/workspace"

function buildReviewPrompt(agent: Agent, diffSection: string, userPrompt: string): string {
  const files = agent.fileChanges ?? []
  return [
    `Review the changes in this workspace.`,
    agent.description ? `\nTask: ${agent.description}` : "",
    files.length > 0 ? `\n## Changed files (${files.length})\n\n${diffSection}` : "\nNo file changes detected yet.",
    `\n## Instructions`,
    `Review the diff above for:`,
    `- **Bugs**: Logic errors, off-by-one, null/undefined access, race conditions, edge cases`,
    `- **Security**: Injection, auth bypass, secret leaks, unsafe input handling`,
    `- **Correctness**: Does the implementation match the task description? Are there missing cases?`,
    `- **Blast radius**: Do the changes break any existing callers or consumers?`,
    userPrompt ? `\n## Additional instructions\n\n${userPrompt}` : "",
    `\n## Output format`,
    `For each issue found, specify:`,
    `- **File and line** (or general if not file-specific)`,
    `- **Severity**: blocking (must fix), suggestion (should fix), nit (optional)`,
    `- **What's wrong and how to fix it**`,
    `\nEnd with an overall verdict: approve, request changes, or comment.`,
    `If no issues found, say so explicitly. Do not invent problems.`,
  ].filter(Boolean).join("\n")
}

/** Header actions for the agent workspace: Create PR, Review, Run. */
export function useWorkspaceActions(agent: Agent | undefined) {
  const workspace = useWorkspaceContext()

  function handleCreatePR() {
    window.dispatchEvent(new CustomEvent("huxflux:send-message", { detail: { content: "Please create a pull request for the changes you've made. Write a clear title and description." } }))
  }

  function handleRun() {
    window.dispatchEvent(new CustomEvent("huxflux:run-script"))
  }

  async function handleReview() {
    if (!agent) return
    try {
      // fire-and-forget; intentional: one-off composite read for an event-driven review action
      // eslint-disable-next-line no-restricted-syntax
      const settings = await api.settings.current()
      const files = agent.fileChanges ?? []
      const diffs = await Promise.all(files.map(async (f) => {
        try {
          // fire-and-forget; intentional: bulk diff read for the review prompt body
          // eslint-disable-next-line no-restricted-syntax
          const patch = await api.agents.diff(agent.id, f.path)
          return { ...f, patch }
        } catch {
          return { ...f, patch: "" }
        }
      }))
      const diffSection = diffs.map((f) => {
        const header = `### ${f.path} (+${f.additions}/-${f.deletions})`
        return f.patch ? `${header}\n\`\`\`diff\n${f.patch}\n\`\`\`` : header
      }).join("\n\n")
      const prompt = buildReviewPrompt(agent, diffSection, settings.reviewPrompt?.trim() || "")
      workspace.createTabWithMessage(agent, prompt, { model: settings.reviewModel, provider: settings.reviewProvider })
    } catch {
      workspace.createTabWithMessage(agent, "Review the changes you've made. Look for bugs, security issues, performance problems, and code quality. Be thorough but concise.")
    }
  }

  return { handleCreatePR, handleRun, handleReview }
}

/** Toast + desktop notification when the agent starts waiting on a question. */
export function useQuestionNotice(agent: Agent | undefined, question: AgentPendingQuestion | null | undefined) {
  const prev = useRef<string | null>(null)
  useEffect(() => {
    const id = question?.toolUseId ?? null
    if (id && id !== prev.current) {
      const title = agent?.title ?? "Agent"
      toast.info(`${title} is asking a question`, { description: question?.questions[0]?.question })
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`${title} needs your input`, { body: question?.questions[0]?.question })
      }
    }
    prev.current = id
  // Keyed on toolUseId only: title/questions update during the same question and
  // we don't want to re-fire the toast/notification when they change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.toolUseId])
}
