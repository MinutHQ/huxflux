import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import { eq, inArray, isNull, and, count } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, messages, toolCalls, fileChanges, terminalLines, terminalTabs, repos } from "../db/schema.js"
import { createWorktree, removeWorktree, getDiffSummary } from "../git/worktrees.js"
import { claimReserve } from "../git/pool.js"
import { watchWorktree, unwatchWorktree, refreshWorktree } from "../git/watcher.js"
import { broadcast, emit } from "../ws/handler.js"
import { stopAgent } from "../claude/runner.js"
import { generateTitle, deriveTitle, titleToBranchSlug } from "../agents/title.js"
import { applyBranchRename, isPlaceholderName } from "../agents/rename.js"
import { killAgentTerminals } from "../ws/pty.js"
import { parsePrStatus } from "../github/prStatus.js"
import { getAvailableProviders } from "../providers/index.js"
import { config } from "../config.js"
import { getSettings } from "../settings.js"
import { findPRForBranch } from "../github/client.js"
import * as path from "node:path"
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import simpleGit from "simple-git"

function runScript(script: string, cwd: string, agentId: string, repoPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sh", ["-c", script], { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "development", HUXFLUX_WORKTREE: cwd, HUXFLUX_AGENT_ID: agentId, HUXFLUX_REPO: repoPath ?? "" } })
    const persistLine = (line: string) => {
      if (!line.trim()) return
      const ts = new Date().toISOString()
      db.insert(terminalLines).values({ id: uuid(), agentId, line: line.trim(), createdAt: ts }).run()
      emit(agentId, { type: "terminal:line", agentId, line: line.trim() })
    }
    proc.stdout?.on("data", (chunk: Buffer) => chunk.toString().split("\n").forEach(persistLine))
    proc.stderr?.on("data", (chunk: Buffer) => chunk.toString().split("\n").forEach(persistLine))
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Setup script exited with code ${code}`)))
    proc.on("error", reject)
  })
}

export async function agentsRoutes(app: FastifyInstance) {
  // GET /api/agents — list (excludes child tabs, soft-deleted, and task refine agents)
  app.get("/api/agents", async () => {
    const rows = db.select().from(agents).where(and(isNull(agents.parentAgentId), isNull(agents.deletedAt), isNull(agents.taskId))).all()
    if (rows.length === 0) return []

    const allFiles = db.select().from(fileChanges)
      .where(inArray(fileChanges.agentId, rows.map((r) => r.id)))
      .all()
    const filesByAgent = new Map<string, typeof allFiles>()
    for (const f of allFiles) {
      const list = filesByAgent.get(f.agentId) ?? []
      list.push(f)
      filesByAgent.set(f.agentId, list)
    }

    return rows.map((a) => {
      const files = filesByAgent.get(a.id) ?? []
      const additions = files.reduce((s, f) => s + f.additions, 0)
      const deletions = files.reduce((s, f) => s + f.deletions, 0)
      return {
        ...a,
        diffSummary: files.length > 0 ? { additions, deletions } : undefined,
        prStatus: parsePrStatus(a.prStatus),
      }
    })
  })

  // GET /api/agents/:id/ports — get listening ports from DB (instant)
  app.get<{ Params: { id: string } }>("/api/agents/:id/ports", async (req) => {
    const { getAgentPortsFromDB } = await import("../git/processes.js")
    return { ports: getAgentPortsFromDB(req.params.id) }
  })

  // GET /api/ports — all listening ports from DB (instant)
  app.get("/api/ports", async () => {
    const { getAllPortsFromDB } = await import("../git/processes.js")
    return getAllPortsFromDB()
  })

  // POST /api/agents/:id/kill-processes — kill processes in a worktree (async)
  app.post<{ Params: { id: string } }>("/api/agents/:id/kill-processes", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found" })
    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })
    const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
    const { killWorktreeProcesses } = await import("../git/processes.js")
    return await killWorktreeProcesses(worktreePath)
  })

  // GET /api/agents/:id/sessions — list child chat sessions (same worktree, different Claude sessions)
  app.get<{ Params: { id: string } }>("/api/agents/:id/sessions", async (req, reply) => {
    const rows = db.select().from(agents)
      .where(and(eq(agents.parentAgentId, req.params.id), isNull(agents.deletedAt)))
      .all()
    return rows
  })

  // GET /api/agents/:id — full agent with messages + files + terminal
  app.get<{ Params: { id: string } }>("/api/agents/:id", async (req, reply) => {
    const agent = db.select().from(agents).where(and(eq(agents.id, req.params.id), isNull(agents.deletedAt))).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    const MESSAGE_LIMIT = 50

    // Count total messages for hasMore
    const totalMsgs = db.select({ count: count() }).from(messages)
      .where(eq(messages.agentId, agent.id))
      .get()?.count ?? 0

    const allMsgs = db.select().from(messages)
      .where(eq(messages.agentId, agent.id))
      .all()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    // Take last MESSAGE_LIMIT
    const msgs = allMsgs.slice(-MESSAGE_LIMIT)
    const hasMore = totalMsgs > MESSAGE_LIMIT

    // Bulk-fetch all tool calls for these messages (avoids N+1)
    const msgIds = msgs.map((m) => m.id)
    const allToolCalls = msgIds.length > 0
      ? db.select().from(toolCalls).where(inArray(toolCalls.messageId, msgIds)).all()
      : []
    const toolCallsByMsg = new Map<string, typeof allToolCalls>()
    for (const tc of allToolCalls) {
      const list = toolCallsByMsg.get(tc.messageId) ?? []
      list.push(tc)
      toolCallsByMsg.set(tc.messageId, list)
    }

    const messagesWithTools = msgs.map((m) => {
      const tcs = (toolCallsByMsg.get(m.id) ?? []).sort((a, b) => a.orderIdx - b.orderIdx)
      return {
        ...m,
        toolCalls: tcs.length > 0 ? tcs.map((tc) => ({
          id: tc.id,
          tool: tc.tool,
          args: tc.args ?? undefined,
          result: tc.result ?? undefined,
          duration: tc.duration ?? undefined,
          precedingText: tc.precedingText ?? undefined,
        })) : undefined,
      }
    })

    const files = db.select().from(fileChanges).where(eq(fileChanges.agentId, agent.id)).all().sort((a, b) => a.path.localeCompare(b.path))
    const terminal = db.select().from(terminalLines)
      .where(eq(terminalLines.agentId, agent.id))
      .all()
      .map((t) => t.line)

    const additions = files.reduce((s, f) => s + f.additions, 0)
    const deletions = files.reduce((s, f) => s + f.deletions, 0)

    return {
      ...agent,
      messages: messagesWithTools,
      hasMore,
      fileChanges: files,
      terminalOutput: terminal,
      diffSummary: files.length > 0 ? { additions, deletions } : undefined,
      prStatus: parsePrStatus(agent.prStatus),
    }
  })

  // POST /api/agents — create agent + worktree
  app.post<{
    Body: {
      repoId?: string
      title: string
      branch: string
      model?: string
      location?: string
      description?: string
      shareWorktreeWith?: string // agent ID to share worktree with
      noWorktree?: boolean
      existingBranch?: boolean  // if true, branch already exists — skip -b and auto-link PR
      baseBranch?: string       // override repo.branchFrom for this agent
      provider?: string         // CLI provider: "claude" | "codex" | "opencode"
    }
  }>("/api/agents", async (req, reply) => {
    const { repoId, title, branch, model = getSettings().defaultModel ?? "Sonnet 4.6", location, description, shareWorktreeWith, noWorktree, existingBranch, baseBranch, provider = getSettings().defaultProvider ?? "claude" } = req.body
    const now = new Date().toISOString()
    const id = uuid()

    // Folder-type repos never use git worktrees
    const linkedRepo = repoId ? db.select().from(repos).where(eq(repos.id, repoId)).get() : null
    const isFolderRepo = linkedRepo?.type === "folder"

    // If sharing a worktree, reuse the existing agent's location
    let agentLocation = location ?? `workspace-${id.slice(0, 8)}`
    let agentRepoId = repoId ?? null
    let skipWorktreeCreation = false

    if (shareWorktreeWith) {
      const sourceAgent = db.select().from(agents).where(eq(agents.id, shareWorktreeWith)).get()
      if (sourceAgent) {
        agentLocation = sourceAgent.location
        agentRepoId = sourceAgent.repoId ?? agentRepoId
        skipWorktreeCreation = true
      }
    }

    // Resolve location collisions — if the name is already taken (in DB or on disk),
    // append an incrementing suffix: workspace-abc → workspace-abc-2 → workspace-abc-3
    if (!skipWorktreeCreation) {
      const repo = agentRepoId ? db.select().from(repos).where(eq(repos.id, agentRepoId)).get() : null
      const base = agentLocation
      let suffix = 2
      while (true) {
        const takenInDb = db.select({ id: agents.id }).from(agents)
          .where(and(eq(agents.location, agentLocation), isNull(agents.deletedAt)))
          .get()
        const takenOnDisk = repo ? existsSync(path.join(repo.workspacesPath, agentLocation)) : false
        if (!takenInDb && !takenOnDisk) break
        agentLocation = `${base}-${suffix++}`
      }
    }

    await db.insert(agents).values({
      id,
      repoId: agentRepoId,
      title,
      status: "in-progress",
      branch: isFolderRepo ? "local" : branch,
      model,
      location: agentLocation,
      description: description ?? null,
      parentAgentId: shareWorktreeWith ?? null,
      noWorktree: (noWorktree || isFolderRepo) ? 1 : null,
      baseBranch: isFolderRepo ? null : (baseBranch ?? null),
      provider,
      createdAt: now,
      updatedAt: now,
    })

    // If a repo is linked and not sharing an existing worktree, create a git worktree
    if (agentRepoId && !skipWorktreeCreation && !noWorktree && !isFolderRepo) {
      const repo = db.select().from(repos).where(eq(repos.id, agentRepoId)).get()
      if (repo) {
        if (!existsSync(repo.path)) {
          await db.delete(agents).where(eq(agents.id, id))
          return reply.code(400).send({ error: `Repo path does not exist on disk: ${repo.path}` })
        }

        if (!existsSync(path.join(repo.path, ".git"))) {
          app.log.info(`Repo path "${repo.path}" has no .git — falling back to direct/folder mode for agent ${id}`)
          db.update(agents).set({ noWorktree: 1, branch: "local" }).where(eq(agents.id, id)).run()
          db.update(repos).set({ type: "folder", workspacesPath: repo.path, branchFrom: "", remote: "" }).where(eq(repos.id, repo.id)).run()
        } else {
          // Try to claim the hidden reserve worktree
          const claimed = await claimReserve(agentRepoId, branch, baseBranch ?? repo.branchFrom)
          if (claimed) {
            agentLocation = claimed.location
            db.update(agents).set({ location: agentLocation }).where(eq(agents.id, id)).run()
          } else {
            const worktreePath = path.join(repo.workspacesPath, agentLocation)
            try {
              await createWorktree(repo.path, branch, worktreePath, baseBranch ?? repo.branchFrom)
            } catch (err) {
              app.log.error(`Failed to create worktree for agent ${id}: ${err}`)
              await db.delete(agents).where(eq(agents.id, id))
              return reply.code(500).send({ error: `Failed to create worktree: ${(err as Error).message}` })
            }
            if (repo.setupScript) {
              try {
                await runScript(repo.setupScript, worktreePath, id, repo.path)
              } catch (err) {
                app.log.warn(`Setup script failed: ${err}`)
              }
            }
          }
        }
      }
    }

    const created = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!created) return reply.code(500).send({ error: "Failed to create agent" })

    // Start live file watcher for the new worktree
    if (agentRepoId && !skipWorktreeCreation && !created.noWorktree && !isFolderRepo) {
      const repo = db.select().from(repos).where(eq(repos.id, agentRepoId)).get()
      if (repo && existsSync(path.join(repo.path, ".git"))) {
        const worktreePath = path.join(repo.workspacesPath, agentLocation)
        watchWorktree(id, worktreePath, baseBranch ?? repo.branchFrom)
      }
    }

    // Auto-create the default t1 terminal tab for root agents (not child sessions)
    if (!shareWorktreeWith) {
      db.insert(terminalTabs).values({
        id: uuid(),
        agentId: id,
        terminalId: "t1",
        label: null,
        orderIdx: 0,
      }).run()
    }

    // Auto-link PR when picking an existing branch (fire-and-forget)
    if (existingBranch && agentRepoId && !isFolderRepo && config.githubToken) {
      const repo = db.select().from(repos).where(eq(repos.id, agentRepoId)).get()
      if (repo?.previewUrl || repo?.path) {
        // Derive remote URL from git config
        simpleGit(repo.path).remote(["get-url", "origin"]).then(async (remoteUrl) => {
          const url = (remoteUrl ?? "").trim()
          if (!url) return
          const pr = await findPRForBranch(url, branch).catch(() => null)
          if (!pr) return
          db.update(agents).set({
            pr: pr.url,
            prNumber: pr.number,
            prStatus: JSON.stringify(pr),
          }).where(eq(agents.id, id)).run()
          const updated = db.select().from(agents).where(eq(agents.id, id)).get()
          if (updated) broadcast({ type: "agent:updated", agent: updated as any })
        }).catch(() => {})
      }
    }

    broadcast({ type: "agent:updated", agent: created as any })
    reply.code(201)
    return created
  })

  // PATCH /api/agents/:id — update status / metadata
  app.patch<{
    Params: { id: string }
    Body: Partial<{ title: string; status: string; branch: string; pr: string; description: string; unread: number; baseBranch: string; draft: string; model: string; provider: string; prCommentMonitoring: boolean | null; ciMonitoring: boolean | null; pinned: boolean }>
  }>("/api/agents/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body
    const now = new Date().toISOString()

    // Read old state before update (needed for rebase --onto)
    const oldAgent = body.baseBranch !== undefined
      ? db.select().from(agents).where(eq(agents.id, id)).get()
      : null

    await db.update(agents).set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.branch !== undefined && { branch: body.branch }),
      ...(body.pr !== undefined && { pr: body.pr }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.unread !== undefined && { unread: body.unread }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.provider !== undefined && { provider: body.provider }),
      ...(body.baseBranch !== undefined && { baseBranch: body.baseBranch }),
      ...(body.draft !== undefined && { draft: body.draft }),
      ...(body.prCommentMonitoring !== undefined && { prCommentMonitoring: body.prCommentMonitoring === null ? null : body.prCommentMonitoring ? 1 : 0 }),
      ...(body.ciMonitoring !== undefined && { ciMonitoring: body.ciMonitoring === null ? null : body.ciMonitoring ? 1 : 0 }),
      ...(body.pinned !== undefined && { pinned: body.pinned ? 1 : 0 }),
      updatedAt: now,
    }).where(eq(agents.id, id))

    const updated = db.select().from(agents).where(eq(agents.id, id)).get()
    if (!updated) return reply.code(404).send({ error: "Not found" })

    // Rebase onto new base branch when baseBranch changes (git repos only)
    if (body.baseBranch !== undefined && updated.repoId && oldAgent) {
      const repo = db.select().from(repos).where(eq(repos.id, updated.repoId)).get()
      if (repo && repo.type !== "folder") {
        const worktreePath = updated.noWorktree ? repo.path : path.join(repo.workspacesPath, updated.location)
        const newBaseRaw = body.baseBranch
        const oldBaseRaw = oldAgent.baseBranch ?? repo.branchFrom
        const git = simpleGit(worktreePath)
        try {
          // Check if remote exists before trying to fetch
          const hasRemote = await git.remote([]).then((r) => !!r?.trim()).catch(() => false)
          if (hasRemote) await git.fetch("origin").catch(() => {})
          // Resolve refs: prefer origin/ prefixed if the remote ref exists
          const resolveRef = async (ref: string): Promise<string> => {
            if (ref.startsWith("origin/")) return ref
            if (hasRemote) {
              const remoteRef = `origin/${ref}`
              const exists = await git.raw(["rev-parse", "--verify", remoteRef]).then(() => true).catch(() => false)
              if (exists) return remoteRef
            }
            return ref
          }
          const newBase = await resolveRef(newBaseRaw)
          const oldBase = await resolveRef(oldBaseRaw)
          // Count commits only on this branch (not on any remote) = agent's own work
          const agentCommits = await git.raw(["rev-list", "--count", "HEAD", "--not", "--remotes"]).then((s) => parseInt(s.trim(), 10)).catch(() => 0)
          if (agentCommits > 0) {
            // Rebase the agent's N commits onto the new base
            await git.rebase(["--onto", newBase, `HEAD~${agentCommits}`])
          } else {
            await git.raw(["reset", "--hard", newBase])
          }
          void refreshWorktree(id, worktreePath, newBaseRaw)
        } catch (err) {
          try { await git.rebase(["--abort"]) } catch { /* already clean */ }
          app.log.error(`Rebase onto ${newBaseRaw} failed for agent ${id}: ${(err as Error).message}`)
        }
      }
    }

    // Auto-kill processes when agent moves to done/cancelled
    if (body.status && (body.status === "done" || body.status === "cancelled") && updated.repoId) {
      const settings = getSettings()
      if (settings.killProcessesOnDone) {
        const repo = db.select().from(repos).where(eq(repos.id, updated.repoId)).get()
        if (repo && !updated.noWorktree) {
          const worktreePath = path.join(repo.workspacesPath, updated.location)
          try {
            const { killWorktreeProcesses, clearAgentPorts } = await import("../git/processes.js")
            const result = await killWorktreeProcesses(worktreePath)
            clearAgentPorts(id)
            if (result.killed > 0) {
              app.log.info(`[auto-kill] killed ${result.killed} process(es) in ${updated.location}`)
            }
          } catch (err) {
            app.log.warn(`[auto-kill] failed for ${updated.location}: ${err}`)
          }
        }
      }
    }

    broadcast({ type: "agent:updated", agent: updated as any })
    return updated
  })

  // POST /api/agents/:id/switch-branch — checkout a different branch in the worktree
  app.post<{ Params: { id: string }; Body: { branch: string; force?: boolean } }>("/api/agents/:id/switch-branch", async (req, reply) => {
    const { id } = req.params
    const { branch, force } = req.body
    if (!branch) return reply.code(400).send({ error: "branch is required" })

    const agent = db.select().from(agents).where(and(eq(agents.id, id), isNull(agents.deletedAt))).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.repoId) return reply.code(400).send({ error: "Agent has no repo" })
    const switchRepo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (switchRepo?.type === "folder") return reply.code(400).send({ error: "Branch switching is not available for folder agents" })
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

    if (force) {
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

    broadcast({ type: "agent:updated", agent: updated as any })

    // Immediately refresh file changes for the new branch
    void refreshWorktree(id, worktreePath, updated.baseBranch ?? repo.branchFrom)

    // Auto-link PR for the new branch (fire-and-forget)
    if (config.githubToken) {
      simpleGit(repo.path).remote(["get-url", "origin"]).then(async (remoteUrl) => {
        const url = (remoteUrl ?? "").trim()
        if (!url) return
        const pr = await findPRForBranch(url, branch).catch(() => null)
        if (!pr) return
        db.update(agents).set({ pr: pr.url, prNumber: pr.number, prStatus: JSON.stringify(pr) }).where(eq(agents.id, id)).run()
        const refreshed = db.select().from(agents).where(eq(agents.id, id)).get()
        if (refreshed) broadcast({ type: "agent:updated", agent: refreshed as any })
      }).catch(() => {})
    }

    return updated
  })

  // POST /api/agents/:id/rename-branch — rename current git branch and relocate worktree
  app.post<{ Params: { id: string }; Body: { branch: string } }>("/api/agents/:id/rename-branch", async (req, reply) => {
    const { id } = req.params
    const { branch } = req.body
    if (!branch) return reply.code(400).send({ error: "branch is required" })

    const renameAgent = db.select().from(agents).where(eq(agents.id, id)).get()
    if (renameAgent?.repoId) {
      const renameRepo = db.select().from(repos).where(eq(repos.id, renameAgent.repoId)).get()
      if (renameRepo?.type === "folder") return reply.code(400).send({ error: "Branch renaming is not available for folder agents" })
    }

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
  app.post<{ Params: { id: string } }>("/api/agents/:id/stop", async (req, reply) => {
    const killed = stopAgent(req.params.id)
    if (!killed) return reply.code(404).send({ error: "No running process for this agent" })
    return { stopped: true }
  })

  // POST /api/agents/:id/generate-title — regenerate title (and optionally branch) from first user message
  app.post<{ Params: { id: string }; Body?: { branch?: boolean } }>("/api/agents/:id/generate-title", async (req, reply) => {
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
    if (shouldRenameBranch && agent.repoId && !agent.parentAgentId && repo?.type !== "folder") {
      const slug = titleToBranchSlug(title)
      if (slug) {
        const result = await applyBranchRename(req.params.id, slug)
        if (!result.ok) app.log.warn(`Branch rename during generate-title failed: ${result.reason}`)
      }
    }

    const updated = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (updated) broadcast({ type: "agent:updated", agent: updated as any })
    return updated
  })

  // DELETE /api/agents/:id — soft delete: marks deleted_at, removes worktree, never hard-deletes DB rows
  app.delete<{ Params: { id: string } }>("/api/agents/:id", async (req, reply) => {
    const t0 = Date.now()
    const log = (step: string) => app.log.info(`[delete ${req.params.id}] ${step} (+${Date.now() - t0}ms)`)
    const agent = db.select().from(agents).where(and(eq(agents.id, req.params.id), isNull(agents.deletedAt))).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    log(`start (noWorktree=${agent.noWorktree}, parentAgentId=${agent.parentAgentId ?? "-"})`)

    const now = new Date().toISOString()

    // Kill all PTY processes for this agent and its children
    killAgentTerminals(req.params.id)
    const childRows = db.select({ id: agents.id }).from(agents)
      .where(eq(agents.parentAgentId, req.params.id))
      .all()
    for (const child of childRows) {
      killAgentTerminals(child.id)
    }
    log(`killed terminals (children=${childRows.length})`)

    // Soft-delete child tabs too
    await db.update(agents)
      .set({ deletedAt: now })
      .where(eq(agents.parentAgentId, req.params.id))
    log("soft-deleted children")

    // Stop live file watcher before removing worktree
    unwatchWorktree(req.params.id)
    log("unwatched")

    // Remove worktree from disk (frees space) but keep DB record.
    // Skip for: child agents (shared worktree), folder-type repos, and
    // anything where noWorktree is set.
    if (agent.repoId && !agent.noWorktree && !agent.parentAgentId) {
      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (repo && repo.type !== "folder" && existsSync(path.join(repo.path, ".git"))) {
        const worktreePath = path.join(repo.workspacesPath, agent.location)
        try {
          await removeWorktree(repo.path, worktreePath)
        } catch (err) {
          app.log.warn(`Worktree removal failed: ${err}`)
        }
        log("removed worktree")
      } else {
        log("worktree removal skipped (folder/no .git)")
      }
    } else {
      log("worktree removal skipped (noWorktree or child)")
    }

    await db.update(agents).set({ deletedAt: now }).where(eq(agents.id, req.params.id))
    log("marked deleted")
    broadcast({ type: "agent:deleted", agentId: req.params.id })
    reply.code(204).send()
    log("replied 204")
  })

  // POST /api/agents/:id/sync-files — refresh file changes from git diff
  app.post<{ Params: { id: string } }>("/api/agents/:id/sync-files", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })
    if (repo.type === "folder") return { diffSummary: { additions: 0, deletions: 0 } }

    const worktreePath = path.join(repo.workspacesPath, agent.location)
    const summary = await getDiffSummary(worktreePath, agent.baseBranch ?? repo.branchFrom)

    return { diffSummary: summary }
  })

  // ── AskUserQuestion support ──────────────────────────────────────────────
  // Questions are detected from the streaming output in runner.ts and emitted
  // via WebSocket. The hook script waits for an answer file written by the
  // /answer endpoint. No curl or network calls in the hook.

  // POST /api/agents/:id/ask — backwards compat with old curl-based hook scripts
  app.post<{
    Params: { id: string }
    Body: { tool_input: { questions: Array<{ question: string; header?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }> }; tool_use_id: string }
  }>("/api/agents/:id/ask", async (req, reply) => {
    const { id } = req.params
    const { tool_input, tool_use_id } = req.body
    const questions = tool_input?.questions ?? []

    app.log.info(`[ask] Agent ${id} AskUserQuestion (legacy hook): ${questions.length} questions, tool_use_id=${tool_use_id}`)

    const { setPendingQuestion } = await import("../askStore.js")
    setPendingQuestion(id, tool_use_id)
    emit(id, { type: "ask:question", agentId: id, toolUseId: tool_use_id, questions })

    // Wait for answer file (written by the /answer endpoint)
    const answerFile = `/tmp/huxflux-ask-${tool_use_id}`
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      try {
        const fsP = await import("node:fs/promises")
        const data = await fsP.readFile(answerFile, "utf8")
        await fsP.unlink(answerFile)
        return JSON.parse(data)
      } catch { /* file doesn't exist yet */ }
      await new Promise(r => setTimeout(r, 200))
    }
    return {}
  })

  // POST /api/agents/:id/answer — called by frontend when user answers a question
  app.post<{
    Params: { id: string }
    Body: { answers: Record<string, string>; toolUseId?: string }
  }>("/api/agents/:id/answer", async (req, reply) => {
    const { id } = req.params
    const { answers, toolUseId } = req.body

    const { getPendingToolUseId, clearPendingQuestion } = await import("../askStore.js")
    const effectiveToolUseId = toolUseId || getPendingToolUseId(id)
    if (!effectiveToolUseId) return reply.code(404).send({ error: "No pending question" })

    clearPendingQuestion(id)

    // Write the answer file that the hook script is waiting for
    const answerFile = `/tmp/huxflux-ask-${effectiveToolUseId}`
    const hookResponse = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { answers },
      },
    })
    const fsP = await import("node:fs/promises")
    await fsP.writeFile(answerFile, hookResponse)

    return { ok: true }
  })

  // POST /api/agents/:id/open-in — open worktree in a local application
  app.post<{ Params: { id: string }; Body: { app: string } }>("/api/agents/:id/open-in", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const worktreePath = agent.noWorktree
      ? repo.path
      : path.join(repo.workspacesPath, agent.location)

    if (!existsSync(worktreePath)) {
      return reply.code(404).send({ error: "Worktree path does not exist on disk" })
    }

    const appName = req.body.app

    // Map app keys to their bundle names and optional CLI launchers.
    // We always use osascript to activate after a short delay so the target app
    // steals focus from the browser (the click event otherwise keeps it in front).
    const apps: Record<string, { bundle: string; cli?: string[] }> = {
      finder:   { bundle: "Finder" },
      vscode:   { bundle: "Visual Studio Code", cli: ["code", worktreePath] },
      cursor:   { bundle: "Cursor", cli: ["cursor", worktreePath] },
      iterm:    { bundle: "iTerm" },
      terminal: { bundle: "Terminal" },
      datagrip: { bundle: "DataGrip" },
    }

    const app = apps[appName]
    if (!app) return reply.code(400).send({ error: `Unknown app: ${appName}` })

    try {
      if (app.cli) {
        const proc = spawn(app.cli[0], app.cli.slice(1), { detached: true, stdio: "ignore" })
        proc.unref()
        // Listen for spawn errors (e.g. command not found)
        await new Promise<void>((resolve, reject) => {
          proc.on("error", reject)
          // If no error fires within 500ms, assume spawn succeeded
          setTimeout(resolve, 500)
        })
      } else {
        spawn("open", ["-a", app.bundle, worktreePath], { detached: true, stdio: "ignore" }).unref()
      }

      // Activate after a delay so the app window is ready
      setTimeout(() => {
        try {
          const script = `tell application "${app.bundle}" to activate`
          spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" }).unref()
        } catch { /* non-critical */ }
      }, 600)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === "ENOENT") {
        const cmd = app.cli?.[0] ?? appName
        return reply.code(422).send({
          error: `"${cmd}" command not found. Open ${app.bundle}, then install the shell command from the Command Palette (Shell Command: Install 'code' command in PATH).`,
        })
      }
      return reply.code(500).send({ error: `Failed to open ${appName}: ${(err as Error).message}` })
    }

    return { ok: true, worktreePath }
  })

  // GET /api/agents/:id/worktree-path — get the resolved worktree path
  app.get<{ Params: { id: string } }>("/api/agents/:id/worktree-path", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const worktreePath = agent.noWorktree
      ? repo.path
      : path.join(repo.workspacesPath, agent.location)

    return { path: worktreePath }
  })

  // GET /api/agents/:id/context — get context window usage from Claude
  app.get<{ Params: { id: string } }>("/api/agents/:id/context", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.sessionId) return reply.code(200).send({ used: 0, limit: 0, percent: 0, model: agent.model })

    const claudeBin = (await import("../claude/runner.js")).getClaudeBin()

    try {
      const result = await new Promise<string>((resolve, reject) => {
        let output = ""
        const proc = spawn(claudeBin, [
          "--resume", agent.sessionId!,
          "-p", "/context",
          "--output-format", "text",
        ], {
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME ?? ""}/.npm-global/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}`,
          },
          timeout: 15_000,
        })
        proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString() })
        proc.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`exit ${code}`)))
        proc.on("error", reject)
      })

      // Parse "Tokens: 190k / 1m (19%)" or "Tokens: 18.2k / 1000k (2%)"
      const tokensMatch = result.match(/\*\*Tokens:\*\*\s*([\d.]+)([km]?)\s*\/\s*([\d.]+)([km]?)\s*\((\d+)%\)/i)
      if (!tokensMatch) {
        return { used: 0, limit: 0, percent: 0, model: agent.model, raw: result }
      }

      function parseTokenCount(num: string, suffix: string): number {
        const n = parseFloat(num)
        if (suffix === "k") return Math.round(n * 1000)
        if (suffix === "m") return Math.round(n * 1_000_000)
        return Math.round(n)
      }

      const used = parseTokenCount(tokensMatch[1], tokensMatch[2].toLowerCase())
      const limit = parseTokenCount(tokensMatch[3], tokensMatch[4].toLowerCase())
      const percent = parseInt(tokensMatch[5], 10)

      // Parse model from "Model: claude-opus-4-6"
      const modelMatch = result.match(/\*\*Model:\*\*\s*(\S+)/)

      // Parse category breakdown
      const categories: Array<{ name: string; tokens: number; percent: number }> = []
      const catRegex = /\|\s*([^|]+?)\s*\|\s*([\d.,]+)([km]?)\s*(?:tokens)?\s*\|\s*([\d.]+)%\s*\|/gi
      let m
      while ((m = catRegex.exec(result)) !== null) {
        const name = m[1].trim()
        if (name === "Category" || name.startsWith("--")) continue
        categories.push({
          name,
          tokens: parseTokenCount(m[2].replace(",", ""), m[3].toLowerCase()),
          percent: parseFloat(m[4]),
        })
      }

      return {
        used,
        limit,
        percent,
        model: modelMatch?.[1] ?? agent.model,
        categories,
      }
    } catch (err) {
      return reply.code(500).send({ error: `Failed to get context: ${(err as Error).message}` })
    }
  })

  // GET /api/providers — list available CLI providers with capabilities and models
  app.get("/api/providers", async () => {
    return getAvailableProviders().map((p) => ({
      id: p.id,
      name: p.name,
      available: p.isAvailable(),
      capabilities: p.capabilities,
      models: p.getModels(),
    }))
  })
}
// force reload 1776007878
