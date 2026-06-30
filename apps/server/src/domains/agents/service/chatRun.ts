import { v4 as uuid } from "uuid"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable, taskComments as taskCommentsTable } from "../../../db/schema.js"
import { tasksWs } from "../../tasks/tasks.ws.js"
import type { RunAgentOptions, TagHandler } from "../../agent-runner/agent-runner.types.js"
import {
  agentTitleHandler,
  agentBranchHandler,
  agentDelegateHandler,
  agentSpawnHandler,
} from "../runnerTags.js"
import {
  taskCommentHandler,
  taskUpdateHandler,
  taskCreateHandler,
  taskStatusHandler,
  taskDependencyHandler,
} from "../../tasks/runnerTags.js"
import { prReplyHandler } from "../../pull-requests/runnerTags.js"
import { buildChatTagInstructions } from "./tagInstructions.js"

interface ChatRunInput {
  agentId: string
  worktreePath: string
  model: string
  planMode?: boolean
  delegateFrom?: string
  sender?: string
  provider?: string
  effort?: string
}

/**
 * Build the `RunAgentOptions` for the standard chat path: wires up every
 * tag handler the chat surface supports (title, branch, delegate, spawn,
 * task-*, pr-reply) plus the matching system-prompt instructions. Centralised
 * here so the route handler and queue drainer don't drift.
 */
export function buildChatRunOptions(input: ChatRunInput): RunAgentOptions {
  const { agentId } = input
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  const repo = agent?.repoId
    ? db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get() ?? null
    : null
  const branchFrom = agent?.baseBranch ?? repo?.branchFrom ?? "HEAD"

  const tags: TagHandler[] = [
    agentTitleHandler(agentId),
    agentBranchHandler(agentId, branchFrom),
    agentDelegateHandler(agentId),
    agentSpawnHandler(agentId),
    taskCommentHandler(agentId),
    taskUpdateHandler(),
    taskCreateHandler(),
    taskStatusHandler(),
    taskDependencyHandler(),
    prReplyHandler(agentId),
  ]

  const allRepos = db.select().from(reposTable).all()
  const availableRepos = allRepos.map((r) => r.name)

  const tagInstructions = buildChatTagInstructions({
    agentTitle: agent?.title ?? agentId,
    branchPrefix: repo?.branchPrefix ?? null,
    isFolderAgent: repo?.type === "folder",
    agentId,
    threadParentId: agent?.threadParentId ?? null,
    hasPrNumber: !!agent?.prNumber,
    availableRepos,
  })

  return {
    agentId: input.agentId,
    worktreePath: input.worktreePath,
    model: input.model,
    planMode: input.planMode,
    delegateFrom: input.delegateFrom,
    sender: input.sender,
    provider: input.provider,
    effort: input.effort,
    tags,
    tagInstructions,
    onAssistantMessage: makeTaskMirror(agentId),
  }
}

/**
 * If the running agent is linked to a task (and isn't a refine agent), mirror
 * each assistant message into the task's comment thread. Returns `undefined`
 * for agents that don't need mirroring so the runner skips the hook entirely.
 */
function makeTaskMirror(agentId: string): RunAgentOptions["onAssistantMessage"] {
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!agent?.taskId || agent.noWorktree) return undefined
  const taskId = agent.taskId
  const authorTitle = agent.title
  return ({ content }) => {
    if (!content) return
    const commentId = uuid()
    const now = new Date().toISOString()
    db.insert(taskCommentsTable).values({
      id: commentId,
      taskId,
      agentId,
      author: authorTitle,
      role: "ai",
      content,
      createdAt: now,
    }).run()
    tasksWs.taskComment(taskId, { id: commentId, author: authorTitle, role: "ai", content, agentId, createdAt: now })
  }
}
