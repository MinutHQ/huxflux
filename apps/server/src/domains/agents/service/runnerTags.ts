import * as path from "node:path"
import { v4 as uuid } from "uuid"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { agentsWs } from "../agents.ws.js"
import { config } from "../../../config.js"
import { getSettings } from "../../settings/settings.service.js"
import { createWorktree } from "../../git/worktrees.js"
import { applyBranchRename } from "../rename.js"
import type { AgentSummary } from "../../../types.js"
import { defineTagHandler, type TagHandler } from "../../agent-runner/agent-runner.types.js"
import { logger } from "../../../logger.js"

// Each factory returns a TagHandler that the agent-runner can dispatch when
// the matching `<huxflux:agents.*>` directive appears in an assistant
// message. Logic that previously lived inside agent-runner (title, branch,
// delegate, spawn) moves here so the runner has no domain coupling.

/**
 * `<huxflux:agents.title>New title</huxflux:agents.title>`
 *
 * Updates the agent's title (truncated to 60 chars) and broadcasts
 * `agent:updated`. Empty bodies are ignored.
 */
export function agentTitleHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "agents.title",
    args: z.object({}),
    onTag: ({ body }) => {
      const title = body.trim().slice(0, 60)
      if (!title) return
      db.update(agentsTable)
        .set({ title, updatedAt: new Date().toISOString() })
        .where(eq(agentsTable.id, agentId))
        .run()
      const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
    },
  })
}

/**
 * `<huxflux:agents.branch>my-new-branch-name</huxflux:agents.branch>`
 *
 * Renames the agent's git branch (and relocates its worktree when safe). The
 * raw body becomes the kebab slug; the repo's `branchPrefix` is added
 * automatically inside `applyBranchRename`. Skipped for folder repos.
 *
 * `branchFrom` defaults to "HEAD" if not provided.
 */
export function agentBranchHandler(agentId: string, branchFrom?: string): TagHandler {
  return defineTagHandler({
    id: "agents.branch",
    args: z.object({}),
    onTag: async ({ body }) => {
      const raw = body.trim()
      if (!raw) return
      const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (!agent?.repoId) return
      const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
      if (repo?.type === "folder") return
      const result = await applyBranchRename(agentId, raw, { branchFrom: branchFrom ?? "HEAD" })
      if (!result.ok) logger.error({ err: result.reason }, `[tags] agents.branch rename failed`)
    },
  })
}

/**
 * `<huxflux:agents.delegate agent="AGENT_ID">message body</huxflux:agents.delegate>`
 *
 * Fires a POST to `/api/agents/<target>/messages` so the target agent picks
 * up the delegated task in its own turn. The sender's title is attached as
 * `sender` so the recipient knows who reached out.
 */
export function agentDelegateHandler(agentId: string): TagHandler {
  return defineTagHandler({
    id: "agents.delegate",
    args: z.object({ agent: z.string().min(1) }),
    onTag: ({ args, body }) => {
      const task = body.trim()
      const target = args.agent.trim()
      if (!target || !task) return
      const sourceTitle = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()?.title ?? "Another agent"
      const payload = JSON.stringify({ content: task, sender: sourceTitle, delegateFrom: agentId })
      logger.info(`[tags] agents.delegate: ${agentId} → ${target}`)
      fetch(`http://localhost:${config.boundPort}/api/agents/${target}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
        },
        body: payload,
      }).catch((err) => logger.error({ err }, `[tags] agents.delegate POST failed for ${target}`))
    },
  })
}

/**
 * `<huxflux:agents.spawn repo="repo-name">task description</huxflux:agents.spawn>`
 *
 * Creates a new thread agent in the named repo, sets up its worktree, runs
 * the repo's setup script, and seeds the new agent's first message with the
 * parent's task description. Only active when `threadsEnabled` is set in
 * settings.
 */
export function agentSpawnHandler(parentAgentId: string): TagHandler {
  return defineTagHandler({
    id: "agents.spawn",
    args: z.object({ repo: z.string().min(1) }),
    onTag: async ({ args, body }) => {
      if (!getSettings().threadsEnabled) return
      await spawnThreadAgent(args.repo, body.trim(), parentAgentId)
    },
  })
}

async function spawnThreadAgent(repoName: string, taskDescription: string, parentAgentId: string): Promise<void> {
  try {
    const allRepos = db.select().from(reposTable).all()
    const repo = allRepos.find((r) => r.name === repoName || r.name.endsWith(`/${repoName}`))
    if (!repo) {
      logger.error(`[tags] agents.spawn: repo "${repoName}" not found`)
      return
    }
    const parentAgent = db.select().from(agentsTable).where(eq(agentsTable.id, parentAgentId)).get()
    if (!parentAgent) return

    const settings = getSettings()
    const id = uuid()
    const location = `thread-${id.slice(0, 8)}`
    const cleanDesc = taskDescription.replace(/^[#*_\->\s]+/, "").split("\n")[0].trim()
    const slug = cleanDesc.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)
    const branchPrefix = repo.branchPrefix ? `${repo.branchPrefix}/` : ""
    const branch = `${branchPrefix}thread-${slug}`
    const now = new Date().toISOString()
    const worktreePath = path.join(repo.workspacesPath, location)
    try {
      await createWorktree(repo.path, branch, worktreePath, repo.branchFrom)
    } catch (err) {
      logger.error({ err }, `[tags] agents.spawn: failed to create worktree for ${repoName}`)
      return
    }
    await runSetupScript(repo, worktreePath)
    db.insert(agentsTable).values({
      id,
      repoId: repo.id,
      title: cleanDesc.slice(0, 60),
      status: "in-progress",
      branch,
      model: settings.defaultModel ?? "Sonnet 4.6",
      location,
      provider: settings.defaultProvider ?? "claude",
      threadParentId: parentAgentId,
      createdAt: now,
      updatedAt: now,
    }).run()
    const created = db.select().from(agentsTable).where(eq(agentsTable.id, id)).get()
    if (created) agentsWs.agentUpdated(created as unknown as AgentSummary)
    sendInitialSpawnMessage(id, parentAgent, parentAgentId, taskDescription)
    logger.info(`[tags] agents.spawn: created thread agent ${id} in ${repoName} for parent ${parentAgentId}`)
  } catch (err) {
    logger.error({ err }, `[tags] agents.spawn failed`)
  }
}

interface RepoForSetup {
  path: string
  setupScript: string | null
}

async function runSetupScript(repo: RepoForSetup, worktreePath: string): Promise<void> {
  if (!repo.setupScript) return
  try {
    const { spawn: spawnProc } = await import("node:child_process")
    await new Promise<void>((resolve, reject) => {
      const proc = spawnProc("sh", ["-c", repo.setupScript!], {
        cwd: worktreePath,
        stdio: "ignore",
        env: { ...process.env, NODE_ENV: "development", HUXFLUX_WORKTREE: worktreePath, HUXFLUX_REPO: repo.path },
      })
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
      proc.on("error", reject)
    })
  } catch {
    // setup is best-effort
  }
}

function sendInitialSpawnMessage(
  spawnedAgentId: string,
  parentAgent: { title: string; branch: string },
  parentAgentId: string,
  taskDescription: string,
): void {
  const parentContext = `You were spawned by "${parentAgent.title}" (${parentAgent.branch}) to handle cross-repo work.\nParent agent ID: ${parentAgentId}\n\nTo send a message back to your parent:\n  <huxflux:agents.delegate agent="${parentAgentId}">message</huxflux:agents.delegate>\n\n---\n\n`
  const body = JSON.stringify({
    content: parentContext + taskDescription.trim(),
    sender: parentAgent.title,
    delegateFrom: parentAgentId,
  })
  fetch(`http://localhost:${config.boundPort}/api/agents/${spawnedAgentId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    },
    body,
  }).catch((err) => logger.error({ err }, `[tags] agents.spawn initial message failed`))
}
