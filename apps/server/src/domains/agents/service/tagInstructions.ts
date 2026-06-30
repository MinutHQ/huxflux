import { getSettings } from "../../settings/settings.service.js"

interface BuildArgs {
  agentTitle: string
  branchPrefix: string | null
  isFolderAgent: boolean
  agentId: string
  threadParentId: string | null
  hasPrNumber: boolean
  availableRepos: string[]
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
    buildPreamble(),
    buildNamingDirective(args.agentTitle, args.branchPrefix, args.isFolderAgent),
    buildDelegateDirective(args.threadParentId, args.agentId),
    ...buildThreadDirective(args.availableRepos),
    ...buildPRReplyDirective(args.hasPrNumber),
  ].filter(Boolean).join("\n\n")
}

function buildPreamble(): string {
  return [
    `## Huxflux inline directives`,
    ``,
    `You have a set of inline directives you can use by writing special XML tags in your response.`,
    `Format: \`<huxflux:namespace.kind attr="value">body</huxflux:namespace.kind>\``,
    `Self-closing (no body): \`<huxflux:namespace.kind attr="value"/>\``,
    ``,
    `How they work:`,
    `1. You write the tag anywhere in your response text (on its own line is best).`,
    `2. The Huxflux server parses these tags from your response after streaming completes.`,
    `3. The server executes the associated action (rename branch, post a PR reply, delegate to another agent, etc.).`,
    `4. The tags are stripped from the visible message, so the user never sees the raw XML.`,
    ``,
    `These are real, functional server-side actions. They are your primary mechanism for interacting with the Huxflux platform beyond tool calls. Use them as documented below.`,
  ].join("\n")
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
    `## Delegation`,
    ``,
    `You can send messages to other agents. The server delivers the message as a new chat message in that agent's conversation.`,
    `  <huxflux:agents.delegate agent="AGENT_ID">task or message to send</huxflux:agents.delegate>`,
    `When the user links other workspaces to your conversation, their agent IDs will appear in the message context. Use those IDs to delegate.`,
  ]
  if (threadParentId) {
    lines.push(
      ``,
      `You are a thread agent spawned by a parent. Your parent agent's ID is "${threadParentId}".`,
      `To report back to your parent, use:`,
      `  <huxflux:agents.delegate agent="${threadParentId}">your update or result</huxflux:agents.delegate>`,
    )
  }
  void agentId
  return lines.join("\n")
}

function buildThreadDirective(availableRepos: string[]): string[] {
  if (!getSettings().threadsEnabled) return []
  const lines = [
    `## Spawning thread agents`,
    ``,
    `You can create a new agent in a different repository. The server creates a fresh workspace, runs the repo's setup script, and sends your task description as the first message. The spawned agent can reply back to you via delegation.`,
    `  <huxflux:agents.spawn repo="repo-name">Full task description with enough context for the new agent to work independently</huxflux:agents.spawn>`,
    `Use this for cross-repo work: translations, shared libraries, documentation sites, etc.`,
  ]
  if (availableRepos.length > 0) {
    lines.push(``, `Available repos: ${availableRepos.join(", ")}`)
  }
  return [lines.join("\n")]
}

function buildPRReplyDirective(hasPrNumber: boolean): string[] {
  void hasPrNumber
  return [
    [
      `## PR review replies`,
      ``,
      `When you receive PR review comments (messages from "PR Review"), fix the issues and reply to each comment on GitHub.`,
      `Use this tag to reply. The server posts it as a threaded reply on the GitHub PR review comment via the GitHub API:`,
      `  <huxflux:pr.reply commentId="COMMENT_ID">your reply explaining what you fixed</huxflux:pr.reply>`,
      `The comment ID is included in the PR review message. Emit one tag per comment you address.`,
      `If the tag fails (e.g. no PR linked, no GitHub token), fall back to the gh CLI:`,
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
    `## Task updates`,
    ``,
    `You are assigned to task "${args.taskId}". Use these tags to update it. The server applies the action and strips the tag from the visible message.`,
    ``,
    `Post a comment to the task thread:`,
    `  <huxflux:tasks.comment taskId="${args.taskId}">A short note for the task thread.</huxflux:tasks.comment>`,
    ``,
    `Mark the task done (or another status):`,
    `  <huxflux:tasks.status taskId="${args.taskId}" status="done"/>`,
    ``,
    `Update the task description:`,
    `  <huxflux:tasks.update taskId="${args.taskId}" field="description">New description body.</huxflux:tasks.update>`,
  ].join("\n")
}
