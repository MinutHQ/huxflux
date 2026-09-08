import { getSettings } from "../../settings/settings.service.js"
import { isPlaceholderName } from "./rename.js"

/** Marker that opens the per-turn placeholder note appended to the user prompt. */
export const PLACEHOLDER_NOTE_PREFIX = "[Huxflux naming]"

interface TurnContextArgs {
  title: string
  branch: string | null
  branchPrefix: string | null
  isFolderAgent: boolean
}

/**
 * Per-turn note appended to the model prompt (never persisted, never shown in
 * the chat) while the agent still carries placeholder names. Returns null once
 * both names are real so renamed agents stop re-emitting the naming tags.
 * Lives in the prompt suffix on purpose: changing the system prompt busts the
 * provider's prompt cache, appending to the newest user message does not.
 */
export function buildNamingTurnContext(args: TurnContextArgs): string | null {
  const titleIsPlaceholder = isPlaceholderName(args.title)
  if (args.isFolderAgent) {
    if (!titleIsPlaceholder) return null
    return `${PLACEHOLDER_NOTE_PREFIX} Your current title "${args.title}" is still a random placeholder. Emit the naming tag in this response as instructed.`
  }
  const prefix = args.branchPrefix ? `${args.branchPrefix}/` : ""
  const branch = args.branch ?? ""
  const branchSuffix = branch.startsWith(prefix) ? branch.slice(prefix.length) : branch
  const branchIsPlaceholder = isPlaceholderName(branchSuffix)
  if (!titleIsPlaceholder && !branchIsPlaceholder) return null
  return `${PLACEHOLDER_NOTE_PREFIX} Your current title "${args.title}" and branch "${branch}" are still random placeholders. Emit both naming tags in this response as instructed.`
}

interface BuildArgs {
  branchPrefix: string | null
  isFolderAgent: boolean
  agentId: string
  threadParentId: string | null
  forkParentId: string | null
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
    buildNamingDirective(args.branchPrefix, args.isFolderAgent),
    buildDelegateDirective(args.threadParentId, args.forkParentId, args.agentId),
    ...buildForkDirective(args.isFolderAgent),
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

/**
 * The wording here must stay byte-identical across turns (it is part of the
 * cached system prompt), so it never embeds the agent's current title. The
 * "you still have placeholder names" fact arrives per turn via
 * `PLACEHOLDER_NOTE_PREFIX` in the user prompt instead.
 */
function buildNamingDirective(branchPrefix: string | null, isFolderAgent: boolean): string {
  const preamble = `## Naming yourself\n`
  if (isFolderAgent) {
    return [
      preamble,
      `New agents start with a RANDOM PLACEHOLDER title (two words plus a short code). It is not a real name.`,
      `When a user message ends with a "${PLACEHOLDER_NOTE_PREFIX}" note, you MUST emit this tag on its own line in that response — before anything else, including any tool calls:`,
      ``,
      `  <huxflux:agents.title>A short task description</huxflux:agents.title>`,
      ``,
      `This rule applies to EVERY task type, including questions, exploration, documentation, refactors, bug fixes, and chat-style conversations.`,
      `Title rules: max ~50 chars, describe the actual task (not "Help with code").`,
      `When no such note is present your title is already real: do not rename unless the focus of the conversation clearly changes.`,
      ``,
      `This folder may not be a git repository. Do not assume git is available unless you verify it.`,
    ].join("\n")
  }
  return [
    preamble,
    `New agents start with a RANDOM PLACEHOLDER title and branch (two words plus a short code). They are not real names.`,
    `When a user message ends with a "${PLACEHOLDER_NOTE_PREFIX}" note, you MUST emit BOTH of these tags on their own lines in that response — before anything else, including any tool calls:`,
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
    `When no such note is present your names are already real: do not rename unless the focus of the conversation clearly changes.`,
  ].join("\n")
}

function buildDelegateDirective(threadParentId: string | null, forkParentId: string | null, agentId: string): string {
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
      `You are a thread agent spawned by a parent for cross-repo work. Your parent agent's ID is "${threadParentId}".`,
      `To report back to your parent, use:`,
      `  <huxflux:agents.delegate agent="${threadParentId}">your update or result</huxflux:agents.delegate>`,
    )
  }
  if (forkParentId) {
    lines.push(
      ``,
      `You were forked from another agent in the same repo. Your parent agent's ID is "${forkParentId}".`,
      `To send updates to your parent, use:`,
      `  <huxflux:agents.delegate agent="${forkParentId}">your update or result</huxflux:agents.delegate>`,
    )
  }
  void agentId
  return lines.join("\n")
}

function buildForkDirective(isFolderAgent: boolean): string[] {
  if (isFolderAgent) return []
  return [
    [
      `## Forking your conversation`,
      ``,
      `You can fork yourself into a new agent in the same repo with its own worktree. The new agent receives a summary you write as its starting context, plus a link back to you for delegation.`,
      `  <huxflux:agents.fork>A summary of the conversation so far and what this fork should focus on</huxflux:agents.fork>`,
      ``,
      `Optional \`from\` attribute controls the branch point:`,
      `- \`from="committed"\` (default): branch from the repo's base branch. Use when exploring an alternative approach from scratch.`,
      `- \`from="head"\`: branch from your current HEAD commit (committed changes only, not uncommitted work). Commit your work first if you want the fork to see it. Use when splitting work (e.g. splitting a large PR into smaller ones).`,
      ``,
      `Example (splitting a PR):`,
      `  <huxflux:agents.fork from="head">We've implemented auth middleware and CSV export. This fork should handle the CSV export portion. The auth middleware changes stay in the parent branch.</huxflux:agents.fork>`,
    ].join("\n"),
  ]
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
