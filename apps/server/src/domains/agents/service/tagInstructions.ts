import { getSettings } from "../../settings/settings.service.js"

interface BuildArgs {
  agentTitle: string
  branchPrefix: string | null
  isFolderAgent: boolean
  agentId: string
  threadParentId: string | null
  hasPrNumber: boolean
}

/**
 * Compose the chat-path tag instructions for an assistant turn.
 *
 * Lives in the agents domain (not agent-runner) because it explains the
 * domain's own tag wire format. Callers pass it through to `runAgent` via
 * `opts.tagInstructions`.
 */
export function buildChatTagInstructions(args: BuildArgs): string {
  return [
    buildNamingDirective(args.agentTitle, args.branchPrefix, args.isFolderAgent),
    buildDelegateDirective(args.threadParentId, args.agentId),
    ...buildThreadDirective(),
    ...buildPRReplyDirective(args.hasPrNumber),
  ].filter(Boolean).join("\n\n")
}

function buildNamingDirective(agentTitle: string, branchPrefix: string | null, isFolderAgent: boolean): string {
  const preamble = `## FIRST RESPONSE REQUIREMENT — name yourself\n`
  if (isFolderAgent) {
    return [
      preamble,
      `Your current title is a RANDOM PLACEHOLDER (e.g. "${agentTitle}"). It is not a real name.`,
      `In your very first response — before anything else, including any tool calls — you MUST emit this tag on its own line:`,
      ``,
      `  <huxflux:agents.title>A short task description</huxflux:agents.title>`,
      ``,
      `This rule applies to EVERY task type, including questions, exploration, documentation, refactors, bug fixes, and chat-style conversations.`,
      `Title rules: max ~50 chars, describe the actual task (not "Help with code").`,
      `If the focus changes later in the conversation, emit the tag again to rename.`,
      ``,
      `This folder may not be a git repository. Do not assume git is available unless you verify it.`,
    ].join("\n")
  }
  return [
    preamble,
    `Your current title and branch are RANDOM PLACEHOLDERS (e.g. "${agentTitle}"). They are not real names.`,
    `In your very first response — before anything else, including any tool calls — you MUST emit BOTH of these tags on their own lines:`,
    ``,
    `  <huxflux:agents.title>A short task description</huxflux:agents.title>`,
    `  <huxflux:agents.branch>kebab-case-version</huxflux:agents.branch>`,
    ``,
    `This rule applies to EVERY task type, including questions, exploration, documentation, refactors, bug fixes, and chat-style conversations. There is no exception for "this isn't a code change" — name yourself anyway based on what you're being asked to do.`,
    `Examples:`,
    `- User asks "explain this repo" → <huxflux:agents.title>Explain repo structure</huxflux:agents.title> + <huxflux:agents.branch>explain-repo</huxflux:agents.branch>`,
    `- User asks "fix the login bug" → <huxflux:agents.title>Fix login bug</huxflux:agents.title> + <huxflux:agents.branch>fix-login-bug</huxflux:agents.branch>`,
    `- User asks "add CSV import" → <huxflux:agents.title>Add CSV import</huxflux:agents.title> + <huxflux:agents.branch>add-csv-import</huxflux:agents.branch>`,
    ``,
    `Title rules: max ~50 chars, describe the actual task (not "Help with code"), no repo or branch name.`,
    `Branch rules: kebab-case, max ~50 chars, NO prefix${branchPrefix ? ` (the prefix "${branchPrefix}/" is added automatically)` : ""}. The tag triggers "git branch -m" and a worktree relocation automatically — do NOT run git branch -m yourself.`,
    `Do NOT run \`git push\`, \`gh\`, or any command that touches a remote (or that opens/updates a PR) before emitting both tags. Otherwise the remote branch will be created under the placeholder name and you'll have to clean it up by hand.`,
    `If the focus changes later in the conversation, emit the tags again to rename.`,
  ].join("\n")
}

function buildDelegateDirective(threadParentId: string | null, agentId: string): string {
  const lines = [
    `Linked workspaces:`,
    `When the user links other workspaces to your conversation, you can send tasks to them:`,
    `  <huxflux:agents.delegate agent="AGENT_ID">task or message</huxflux:agents.delegate>`,
    `The linked agent IDs will be provided in the message context when workspaces are linked.`,
  ]
  if (threadParentId) {
    lines.push(``, `You are a thread agent. To reply to your parent agent, use the delegate tag with their ID.`)
  }
  // Reference agentId so the prompt feels less generic when delegate is the
  // primary callback path.
  void agentId
  return lines.join("\n")
}

function buildThreadDirective(): string[] {
  if (!getSettings().threadsEnabled) return []
  return [
    [
      `Thread agents:`,
      `To spawn a new agent in another repo (for cross-repo work like translations, shared libraries, etc.):`,
      `  <huxflux:agents.spawn repo="repo-name">Full task description with context</huxflux:agents.spawn>`,
      `This creates a new workspace in that repo. Include enough context so the spawned agent understands WHY the changes are needed.`,
    ].join("\n"),
  ]
}

function buildPRReplyDirective(hasPrNumber: boolean): string[] {
  // Always include the directive so the model has the gh CLI fallback even
  // before a PR exists (it might create one mid-turn). The huxflux tag is
  // the preferred path; the gh fallback covers no-PR / no-token cases.
  void hasPrNumber
  return [
    [
      `PR feedback:`,
      `When you receive PR review comments (messages from "PR Review"), fix the issues and then reply on GitHub.`,
      `Preferred: use the huxflux tag to reply (the server posts it via the GitHub API):`,
      `  <huxflux:pr.reply commentId="COMMENT_ID">your reply explaining what you fixed</huxflux:pr.reply>`,
      `The comment ID is included in the PR review message.`,
      `If the tag does not work (e.g. no PR linked, no GitHub token), fall back to the gh CLI:`,
      `  gh api repos/OWNER/REPO/pulls/comments/COMMENT_ID/replies -f body='your reply'`,
      `After fixing and replying, push your changes.`,
    ].join("\n"),
  ]
}

interface TaskTagArgs {
  taskId: string
}

/**
 * Tag instructions for working agents linked to a task. Adds the
 * `<huxflux:tasks.*>` documentation on top of the standard chat directives.
 */
export function buildTaskWorkTagInstructions(args: TaskTagArgs): string {
  return [
    `Task tags:`,
    `When you have updates about your assigned task (id "${args.taskId}"), emit these tags inline in your response. The server applies them and strips them from the visible chat.`,
    ``,
    `  <huxflux:tasks.comment taskId="${args.taskId}">A short note for the task thread.</huxflux:tasks.comment>`,
    `  <huxflux:tasks.status taskId="${args.taskId}" status="done"/>`,
    `  <huxflux:tasks.update taskId="${args.taskId}" field="description">New description body.</huxflux:tasks.update>`,
  ].join("\n")
}
