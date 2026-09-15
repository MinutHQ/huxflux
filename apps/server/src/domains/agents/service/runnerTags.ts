import * as path from "node:path"
import { existsSync, rmSync } from "node:fs"
import { v4 as uuid } from "uuid"
import { z } from "zod/v4"
import { eq, type InferSelectModel } from "drizzle-orm"
import { simpleGit } from "simple-git"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable, terminalTabs as terminalTabsTable } from "../../../db/schema.js"
import { enqueue, drainQueue } from "./messageQueue.js"
import { runSetupScript as runStreamingSetup } from "./setupScript.js"
import { watchWorktree } from "../../git/watcher.js"
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
 * or `<huxflux:agents.spawn repoId="...">task description</huxflux:agents.spawn>`
 *
 * Creates a new thread agent in the target repo, sets up its worktree, runs
 * the repo's setup script (streamed to the agent's terminal), seeds the new
 * agent's first message with the parent's task description, and starts that
 * first turn. Any failure is reported back to the parent agent as a
 * "system" message instead of being swallowed. Only active when
 * `threadsEnabled` is enabled in settings (on by default).
 */
export function agentSpawnHandler(parentAgentId: string): TagHandler {
  return defineTagHandler({
    id: "agents.spawn",
    args: z.object({
      repo: z.string().min(1).optional(),
      repoId: z.string().min(1).optional(),
    }),
    onTag: async ({ args, body }) => {
      if (!getSettings().threadsEnabled) {
        return {
          followUp: {
            content:
              'Cross-repo threads are disabled in settings. Enable the "Thread agents" toggle (Experimental section) to use this tag.',
            sender: "system",
          },
        }
      }
      const task = body.trim()
      if (!task) return
      const repoName = args.repo?.trim() || undefined
      const repoId = args.repoId?.trim() || undefined
      if (!repoName && !repoId) {
        return {
          followUp: {
            content: 'No target repo given. Address it by name (repo="repo-name") or by id (repoId="...").',
            sender: "system",
          },
        }
      }
      const spawned = await spawnThreadAgent(repoName, repoId, task, parentAgentId)
      if (!spawned.ok) {
        return {
          followUp: {
            content: `Thread agent spawn failed: ${spawned.error}`,
            sender: "system",
          },
        }
      }
      return {
        followUp: {
          content: [
            `Thread agent "${spawned.title}" spawned in "${repoName ?? repoId}".`,
            `Agent ID: ${spawned.id}`,
            ``,
            `Your task description was seeded as its first message, so it will start working on it immediately.`,
            `To send it a message:`,
            `  <huxflux:agents.delegate agent="${spawned.id}">your message</huxflux:agents.delegate>`,
          ].join("\n"),
          sender: "system",
        },
      }
    },
  })
}

type SpawnResult = { ok: true; id: string; title: string } | { ok: false; error: string }

type RepoRow = InferSelectModel<typeof reposTable>
type AgentRow = InferSelectModel<typeof agentsTable>

interface ThreadRefs {
  id: string
  title: string
  location: string
  branch: string
  worktreePath: string
  model: string
  provider: string
}

/**
 * Resolve the target repo of a spawn tag. An exact `repoId` match takes
 * precedence; otherwise the repo is matched by name (full name or
 * trailing-segment match, mirroring the pre-existing name rule). Returns
 * either the repo row or a human-readable error.
 */
function resolveSpawnTarget(repoName: string | undefined, repoId: string | undefined): { repo: RepoRow } | { error: string } {
  const allRepos = db.select().from(reposTable).all()
  const lookup = repoId ?? repoName
  const repo = repoId
    ? allRepos.find((r) => r.id === repoId)
    : allRepos.find((r) => r.name === repoName || r.name.endsWith(`/${repoName}`))
  if (!repo) return { error: `Unknown repo: "${lookup}"` }
  if (repo.type === "folder") return { error: `Repo "${repo.name}" is a folder, not a git repo. Thread agents require a git repo.` }
  if (!existsSync(repo.path)) return { error: `Repo path does not exist on disk: ${repo.path}` }
  return { repo }
}

/**
 * Derive the thread agent's identity from the parent and the task text.
 *
 * The slug is sanitized the same way as branch names (collapse repeated
 * dashes, trim edge dashes); the id suffix keeps same-text spawns on distinct
 * branches (mirrors forkAgent). The worktree location is the branch minus the
 * repo prefix, so the pre-spawn `reconcileWorktreeLocation` sees a
 * location/branch pair that is already aligned and does not move the
 * worktree out from under the first turn.
 */
function buildThreadRefs(repo: RepoRow, taskDescription: string, parentAgent: AgentRow): ThreadRefs {
  const settings = getSettings()
  const id = uuid()
  const cleanDesc = taskDescription.replace(/^[#*_\->\s]+/, "").split("\n")[0].trim()
  const title = (cleanDesc.slice(0, 60) || `Thread of ${parentAgent.title}`).slice(0, 60)
  const slug = (cleanDesc.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)) || "unnamed"
  const location = `thread-${slug}-${id.slice(0, 6)}`
  const branch = `${repo.branchPrefix ? `${repo.branchPrefix}/` : ""}${location}`
  return {
    id,
    title,
    location,
    branch,
    worktreePath: path.join(repo.workspacesPath, location),
    // Inherit from the parent, falling back to the profile's defaults
    model: parentAgent.model ?? settings.defaultModel ?? "Sonnet 4.6",
    provider: parentAgent.provider ?? (settings.defaultProvider ?? "claude"),
  }
}

/** Insert the agent row plus the default t1 terminal tab. */
function insertAgentRow(repo: RepoRow, parentAgentId: string, refs: ThreadRefs): void {
  const now = new Date().toISOString()
  db.insert(agentsTable).values({
    id: refs.id,
    repoId: repo.id,
    title: refs.title,
    status: "in-progress",
    branch: refs.branch,
    model: refs.model,
    location: refs.location,
    provider: refs.provider,
    threadParentId: parentAgentId,
    createdAt: now,
    updatedAt: now,
  }).run()
  db.insert(terminalTabsTable).values({
    id: uuid(),
    agentId: refs.id,
    terminalId: "t1",
    label: null,
    orderIdx: 0,
  }).run()
}

/** Seed context the spawned agent starts with, before its task description. */
function buildSpawnContext(parentAgent: AgentRow, parentAgentId: string): string {
  return [
    `You were spawned by "${parentAgent.title}" (${parentAgent.branch}) to handle cross-repo work.`,
    `Parent agent ID: ${parentAgentId}`,
    ``,
    `To send a message back to your parent:`,
    `  <huxflux:agents.delegate agent="${parentAgentId}">message</huxflux:agents.delegate>`,
  ].join("\n")
}

/** Roll back a half-spawned thread agent (row + worktree + cascaded rows). */
function rollBackThread(id: string, worktreePath: string): void {
  db.delete(agentsTable).where(eq(agentsTable.id, id)).run()
  try { rmSync(worktreePath, { recursive: true, force: true }) } catch { /* already gone */ }
}

/**
 * Create a thread agent in the target repo for cross-repo work.
 *
 * The agent row is inserted before the setup script runs (the script
 * streams terminal lines tied to the agent) and is rolled back on script
 * failure. Every failure path returns a human-readable reason instead of
 * silently failing.
 */
async function spawnThreadAgent(
  repoName: string | undefined,
  repoId: string | undefined,
  taskDescription: string,
  parentAgentId: string,
): Promise<SpawnResult> {
  try {
    const target = resolveSpawnTarget(repoName, repoId)
    if ("error" in target) {
      logger.error(`[tags] agents.spawn: ${target.error}`)
      return { ok: false, error: target.error }
    }
    const { repo } = target
    const parentAgent = db.select().from(agentsTable).where(eq(agentsTable.id, parentAgentId)).get()
    if (!parentAgent) {
      logger.error(`[tags] agents.spawn: parent agent ${parentAgentId} not found`)
      return { ok: false, error: `Parent agent not found: ${parentAgentId}` }
    }
    const refs = buildThreadRefs(repo, taskDescription, parentAgent)
    try {
      await createWorktree(repo.path, refs.branch, refs.worktreePath, repo.branchFrom)
    } catch (err) {
      logger.error({ err }, `[tags] agents.spawn: failed to create worktree for ${repo.name}`)
      return { ok: false, error: `Failed to create worktree: ${(err as Error).message}` }
    }

    // Agent row (plus default terminal tab) goes in before the setup script
    // runs: the script streams terminal lines tied to the agent.
    insertAgentRow(repo, parentAgentId, refs)
    const created = db.select().from(agentsTable).where(eq(agentsTable.id, refs.id)).get()
    if (created) agentsWs.agentUpdated(created as unknown as AgentSummary)
    if (repo.setupScript) {
      try {
        await runStreamingSetup(repo.setupScript, refs.worktreePath, refs.id, repo.path)
      } catch (err) {
        rollBackThread(refs.id, refs.worktreePath)
        logger.error({ err }, `[tags] agents.spawn: setup script failed for ${repo.name}`)
        return { ok: false, error: `Setup script failed: ${(err as Error).message}` }
      }
    }
    watchWorktree(refs.id, refs.worktreePath, repo.branchFrom)

    enqueue(refs.id, {
      content: `${buildSpawnContext(parentAgent, parentAgentId)}\n\n---\n\n${taskDescription.trim()}`,
      worktreePath: refs.worktreePath,
      model: refs.model,
      sender: parentAgent.title,
      delegateFrom: parentAgentId,
      provider: refs.provider,
    })
    drainQueue(refs.id)
    logger.info(`[tags] agents.spawn: created thread agent ${refs.id} in ${repo.name} for parent ${parentAgentId}`)
    return { ok: true, id: refs.id, title: refs.title }
  } catch (err) {
    logger.error({ err }, `[tags] agents.spawn failed`)
    return { ok: false, error: `Spawn failed: ${(err as Error).message}` }
  }
}

interface RepoForSetup {
  path: string
  setupScript: string | null
}

/**
 * Fork-only silent setup runner. Spawn uses the streaming version
 * (`service/setupScript.ts`), which pipes output to the agent's terminal
 * lines; forks are best-effort so their setup stays silent on purpose.
 */
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

/**
 * Fork-only fire-and-forget first message (HTTP POST to the messages
 * route). Spawn seeds its first message in-process via
 * `enqueue` + `drainQueue` instead, so the seeded turn starts
 * immediately and delivery is not lost on request failure.
 */
function sendInitialMessage(
  targetAgentId: string,
  parentAgent: { title: string; branch: string },
  parentAgentId: string,
  context: string,
  body: string,
): void {
  const content = `${context}\n\n---\n\n${body.trim()}`
  const payload = JSON.stringify({
    content,
    sender: parentAgent.title,
    delegateFrom: parentAgentId,
  })
  fetch(`http://localhost:${config.boundPort}/api/agents/${targetAgentId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    },
    body: payload,
  }).catch((err) => logger.error({ err }, `[tags] initial message failed for ${targetAgentId}`))
}

/**
 * `<huxflux:agents.fork from="committed|head">summary for the new agent</huxflux:agents.fork>`
 *
 * Forks the current conversation into a new agent in the same repo with its own
 * worktree. The tag body is a summary written by the forking agent that seeds
 * the new conversation. `from` controls the branch point:
 *   - "committed" (default): branch from the repo's base branch (clean start)
 *   - "head": branch from the parent agent's current HEAD commit
 */
export function agentForkHandler(parentAgentId: string): TagHandler {
  return defineTagHandler({
    id: "agents.fork",
    args: z.object({ from: z.enum(["committed", "head"]).optional() }),
    onTag: async ({ args, body }) => {
      const summary = body.trim()
      if (!summary) return
      const forked = await forkAgent(summary, parentAgentId, args.from ?? "committed")
      if (!forked) return
      return {
        followUp: {
          content: [
            `Forked agent "${forked.title}" created.`,
            `Agent ID: ${forked.id}`,
            ``,
            `To send it a message:`,
            `  <huxflux:agents.delegate agent="${forked.id}">your message</huxflux:agents.delegate>`,
          ].join("\n"),
          sender: "system",
        },
      }
    },
  })
}

async function forkAgent(
  summary: string,
  parentAgentId: string,
  from: "committed" | "head",
): Promise<{ id: string; title: string } | null> {
  try {
    const parentAgent = db.select().from(agentsTable).where(eq(agentsTable.id, parentAgentId)).get()
    if (!parentAgent?.repoId) return null
    const repo = db.select().from(reposTable).where(eq(reposTable.id, parentAgent.repoId)).get()
    if (!repo || repo.type === "folder") return null

    const settings = getSettings()
    const id = uuid()
    const location = `fork-${id.slice(0, 8)}`
    const cleanDesc = summary.replace(/^[#*_\->\s]+/, "").split("\n")[0].trim()
    const title = (cleanDesc.slice(0, 60) || `Fork of ${parentAgent.title}`).slice(0, 60)
    const slug = cleanDesc.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)
    const branchPrefix = repo.branchPrefix ? `${repo.branchPrefix}/` : ""
    const branch = `${branchPrefix}fork-${slug || "unnamed"}-${id.slice(0, 6)}`
    const now = new Date().toISOString()
    const worktreePath = path.join(repo.workspacesPath, location)

    let startPoint: string | undefined
    if (from === "head") {
      const currentWorktreePath = parentAgent.noWorktree
        ? repo.path
        : path.join(repo.workspacesPath, parentAgent.location)
      const git = simpleGit(currentWorktreePath)
      startPoint = (await git.revparse(["HEAD"])).trim()
    } else {
      startPoint = repo.branchFrom
    }

    try {
      await createWorktree(repo.path, branch, worktreePath, startPoint)
    } catch (err) {
      logger.error({ err }, `[tags] agents.fork: failed to create worktree`)
      return null
    }
    await runSetupScript(repo, worktreePath)

    db.insert(agentsTable).values({
      id,
      repoId: repo.id,
      title,
      status: "in-progress",
      branch,
      model: settings.defaultModel ?? "Sonnet 4.6",
      location,
      provider: settings.defaultProvider ?? "claude",
      forkParentId: parentAgentId,
      createdAt: now,
      updatedAt: now,
    }).run()

    const created = db.select().from(agentsTable).where(eq(agentsTable.id, id)).get()
    if (created) agentsWs.agentUpdated(created as unknown as AgentSummary)

    const parentContext = [
      `You were forked from "${parentAgent.title}" (${parentAgent.branch}).`,
      `Parent agent ID: ${parentAgentId}`,
      `Branch point: ${from === "head" ? `parent's HEAD (${startPoint?.slice(0, 10)})` : `repo base (${startPoint ?? "HEAD"})`}`,
      ``,
      `To send a message back to your parent:`,
      `  <huxflux:agents.delegate agent="${parentAgentId}">message</huxflux:agents.delegate>`,
    ].join("\n")

    sendInitialMessage(id, parentAgent, parentAgentId, parentContext, summary)
    logger.info(`[tags] agents.fork: created fork ${id} from ${parentAgentId} (${from})`)
    return { id, title }
  } catch (err) {
    logger.error({ err }, `[tags] agents.fork failed`)
    return null
  }
}
