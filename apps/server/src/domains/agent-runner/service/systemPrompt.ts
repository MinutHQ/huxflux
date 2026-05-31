import type { ProviderAdapter } from "../../providers/providers.types.js"

interface SystemPromptArgs {
  agentId: string
  agent: { id: string; title: string; branch: string; prNumber: number | null; threadParentId: string | null } | null
  repo: { branchPrefix: string | null; type?: string | null } | null
  planMode: boolean
  taskContext?: string
  /**
   * Free-form prose, owned by the call site, that lists the `<huxflux:*>`
   * directives the model is allowed to emit on this run. The runner has no
   * knowledge of any specific tag id; only the caller knows which side
   * effects it has wired up.
   */
  tagInstructions?: string
  provider: ProviderAdapter
}

/**
 * Build the system prompt sent to the model on each turn. Returns the full
 * prompt as a single string.
 *
 * The runner contributes only generic chat scaffolding: agent identity,
 * answer-format guidance, plan-mode hints, and the optional `taskContext`
 * passthrough used by refinement agents. All tag-specific instructions
 * (title, branch, task mutations, automation steps, etc.) come from the
 * caller via `tagInstructions` so the runner stays domain-agnostic.
 */
export function buildSystemPrompt(args: SystemPromptArgs): string {
  const { agentId, agent, repo, planMode, taskContext, tagInstructions, provider } = args
  if (taskContext) return buildRefinePrompt(taskContext)

  const agentTitle = agent?.title ?? agentId
  const agentBranch = agent?.branch ?? ""
  const isFolderAgent = repo?.type === "folder"
  const introLine = isFolderAgent
    ? `You are a Huxflux agent. Your agent ID is "${agentId}" and your current title is "${agentTitle}". You are working directly in a folder (not a git repository).`
    : `You are a Huxflux agent. Your agent ID is "${agentId}", your current title is "${agentTitle}", and your current git branch is "${agentBranch}".`

  const lines = [
    introLine,
    ``,
    `Quality checks:`,
    `- Before telling the user you are done, run the project's test/lint/typecheck commands if they exist in the project's CLAUDE.md or package.json.`,
    `- If any check fails, fix the issue and re-run. Do not declare work complete with failing checks.`,
    `- If you are unsure what commands to run, check package.json scripts or CLAUDE.md for guidance.`,
    ``,
    `Answer format:`,
    `- Use newlines to separate thoughts, steps, and observations — not colons or semicolons.`,
    `- Start each new idea or action on its own line.`,
    ...buildPlanModeDirective(planMode, provider),
  ]
  if (tagInstructions && tagInstructions.trim()) {
    lines.push(``, tagInstructions.trim())
  }
  return lines.join("\n")
}

function buildRefinePrompt(taskContext: string): string {
  return [
    `You are a Huxflux refinement assistant.`,
    ``,
    taskContext,
  ].join("\n")
}

function buildPlanModeDirective(planMode: boolean, provider: ProviderAdapter): string[] {
  if (!planMode || !provider.capabilities.planMode) return []
  return [
    ``,
    `You are in plan mode. You MUST describe your full plan in your response text so the user can read it in the chat.`,
    `Do NOT only write to the plan file — output the plan steps directly in your message.`,
    `After describing the plan, call ExitPlanMode.`,
  ]
}
