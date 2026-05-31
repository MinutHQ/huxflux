import type { FastifyInstance } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { eq, isNull, and } from "drizzle-orm"
import {
  switchBranchBodySchema,
  renameBranchBodySchema,
  generateTitleBodySchema,
} from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, messages, repos } from "../../../db/schema.js"
import { refreshWorktree } from "../../git/watcher.js"
import { agentsWs } from "../agents.ws.js"
import { findPRForBranch } from "../../pull-requests/prStatus.js"
import { config } from "../../../config.js"
import { stopAgent } from "../../agent-runner/agent-runner.service.js"
import { generateTitle, deriveTitle, titleToBranchSlug } from "../service/title.js"
import { applyBranchRename, isPlaceholderName } from "../service/rename.js"
import type { AgentSummary } from "../../../types.js"
import * as path from "node:path"
import { existsSync } from "node:fs"
import { simpleGit } from "simple-git"

const idParamsSchema = z.object({ id: z.string() })

export const agentsBranchRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/agents/:id/switch-branch — checkout a different branch in the worktree
  app.post(
    "/api/agents/:id/switch-branch",
    { schema: { params: idParamsSchema, body: switchBranchBodySchema } },
    async (req, reply) => {
      return switchBranchHandler({ params: req.params, body: req.body }, reply)
    },
  )

  // POST /api/agents/:id/rename-branch — rename current git branch and relocate worktree
  app.post("/api/agents/:id/rename-branch", {
    schema: { params: idParamsSchema, body: renameBranchBodySchema },
  }, async (req, reply) => {
    const { id } = req.params
    const { branch } = req.body

    const result = await applyBranchRename(id, branch)
    if (!result.ok) {
      const status = result.reason?.includes("already used") ? 409 : 400
      return reply.code(status).send({ error: result.reason ?? "rename failed" })
    }

    const updated = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!updated) return reply.code(500).send({ error: "Update failed" })
    return updated
  })

  // POST /api/agents/:id/stop — kill the running Claude process
  app.post("/api/agents/:id/stop", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const killed = stopAgent(req.params.id)
    if (!killed) return reply.code(404).send({ error: "No running process for this agent" })
    return { stopped: true }
  })

  // POST /api/agents/:id/generate-title — regenerate title (and optionally branch) from first user message
  app.post(
    "/api/agents/:id/generate-title",
    // Body is optional — older callers send no body at all. Make the body
    // schema accept undefined so validation succeeds either way.
    { schema: { params: idParamsSchema, body: generateTitleBodySchema.nullish() } },
    async (req, reply) => {
      return generateTitleHandler(app, { params: req.params, body: req.body ?? undefined }, reply)
    },
  )
}

interface SwitchBranchReq {
  params: { id: string }
  body: { branch: string; force?: boolean }
}

async function switchBranchHandler(req: SwitchBranchReq, reply: import("fastify").FastifyReply): Promise<unknown> {
  const { id } = req.params
  const { branch, force } = req.body
  if (!branch) return reply.code(400).send({ error: "branch is required" })

  const agent = db.select().from(agents).where(and(eq(agents.id, id), isNull(agents.deletedAt))).get()
  if (!agent) return reply.code(404).send({ error: "Not found" })
  if (!agent.repoId) return reply.code(400).send({ error: "Agent has no repo" })
  if (agent.branch === branch) return agent

  // Check if another agent in this repo already has this branch
  const conflict = db.select({ id: agents.id, title: agents.title })
    .from(agents)
    .where(and(eq(agents.repoId, agent.repoId), eq(agents.branch, branch), isNull(agents.deletedAt)))
    .get()
  if (conflict && conflict.id !== id) {
    return reply.code(409).send({ error: `Branch "${branch}" is already checked out by "${conflict.title}"` })
  }

  const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
  if (!repo) return reply.code(400).send({ error: "Repo not found" })

  const worktreePath = path.join(repo.workspacesPath, agent.location)
  if (!existsSync(worktreePath)) return reply.code(400).send({ error: "Worktree not found on disk" })

  const mainGit = simpleGit(repo.path)
  const wt = simpleGit(worktreePath)
  await wt.fetch(["--no-tags", "origin", branch]).catch(() => {})

  if (force) await forceFreeBranch(mainGit, branch, worktreePath)

  try {
    await wt.checkout(branch)
  } catch (err) {
    const msg = String((err as Error).message ?? err)
    if (msg.includes("already checked out") || msg.includes("is already used")) {
      return reply.code(409).send({ error: `Branch "${branch}" is already checked out in another worktree`, code: "BRANCH_LOCKED" })
    }
    return reply.code(500).send({ error: `Git checkout failed: ${msg}` })
  }

  const now = new Date().toISOString()
  db.update(agents).set({ branch, pr: null, prNumber: null, prStatus: null, updatedAt: now }).where(eq(agents.id, id)).run()

  const updated = db.select().from(agents).where(eq(agents.id, id)).get()
  if (!updated) return reply.code(500).send({ error: "Update failed" })

  agentsWs.agentUpdated(updated as unknown as AgentSummary)

  // Immediately refresh file changes for the new branch
  void refreshWorktree(id, worktreePath, updated.baseBranch ?? repo.branchFrom)

  // Auto-link PR for the new branch (fire-and-forget)
  if (config.githubToken) void autoLinkPRAfterSwitch(id, repo.path, branch)

  return updated
}

async function forceFreeBranch(mainGit: ReturnType<typeof simpleGit>, branch: string, worktreePath: string): Promise<void> {
  // Prune stale entries and force-remove any worktree that still has this branch locked
  const listRaw = await mainGit.raw(["worktree", "list", "--porcelain"]).catch(() => "")
  const blocks = listRaw.trim().split(/\n\n+/)
  for (const block of blocks) {
    const lines = block.split("\n")
    const pathLine = lines.find((l) => l.startsWith("worktree "))
    const branchLine = lines.find((l) => l.startsWith("branch "))
    if (!pathLine || !branchLine) continue
    const wtPath = pathLine.slice("worktree ".length).trim()
    const wtBranch = branchLine.slice("branch refs/heads/".length).trim()
    if (wtBranch === branch && wtPath !== worktreePath) {
      await mainGit.raw(["worktree", "remove", "--force", wtPath]).catch(() => {})
    }
  }
  await mainGit.raw(["worktree", "prune"]).catch(() => {})
}

async function autoLinkPRAfterSwitch(id: string, repoPath: string, branch: string): Promise<void> {
  try {
    const remoteUrl = await simpleGit(repoPath).remote(["get-url", "origin"])
    const url = (remoteUrl ?? "").trim()
    if (!url) return
    const pr = await findPRForBranch(url, branch).catch(() => null)
    if (!pr) return
    db.update(agents).set({ pr: pr.url, prNumber: pr.number, prStatus: JSON.stringify(pr) }).where(eq(agents.id, id)).run()
    const refreshed = db.select().from(agents).where(eq(agents.id, id)).get()
    if (refreshed) agentsWs.agentUpdated(refreshed as unknown as AgentSummary)
  } catch { /* best-effort */ }
}

async function generateTitleHandler(
  app: FastifyInstance,
  req: { params: { id: string }; body?: { branch?: boolean } },
  reply: import("fastify").FastifyReply,
): Promise<unknown> {
  const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
  if (!agent) return reply.code(404).send({ error: "Not found" })

  const firstUserMsg = db.select().from(messages)
    .where(eq(messages.agentId, req.params.id))
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .find((m) => m.role === "user")
  if (!firstUserMsg) return reply.code(400).send({ error: "No user messages" })

  const title = await generateTitle(firstUserMsg.content).catch(() => deriveTitle(firstUserMsg.content))
  const now = new Date().toISOString()
  db.update(agents).set({ title, updatedAt: now }).where(eq(agents.id, req.params.id)).run()

  // Also rename the branch when the caller asked or when the current branch
  // still has the random-bee placeholder suffix.
  const repo = agent.repoId ? db.select().from(repos).where(eq(repos.id, agent.repoId)).get() : null
  const prefix = repo?.branchPrefix ? `${repo.branchPrefix}/` : ""
  const branchSuffix = agent.branch?.startsWith(prefix) ? agent.branch.slice(prefix.length) : (agent.branch ?? "")
  const shouldRenameBranch = req.body?.branch === true || isPlaceholderName(branchSuffix)
  if (shouldRenameBranch && agent.repoId && !agent.parentAgentId) {
    const slug = titleToBranchSlug(title)
    if (slug) {
      const result = await applyBranchRename(req.params.id, slug)
      if (!result.ok) app.log.warn(`Branch rename during generate-title failed: ${result.reason}`)
    }
  }

  const updated = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
  if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
  return updated
}
