import type { FastifyInstance } from "fastify"
import { v4 as uuid } from "uuid"
import * as path from "node:path"
import * as os from "node:os"
import * as fsSync from "node:fs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { db } from "../db/index.js"
import { repos, agents } from "../db/schema.js"
import { eq } from "drizzle-orm"
import type { Repo } from "../types.js"
import { listBranches } from "../github/client.js"
import { getRemoteUrl } from "../git/worktrees.js"
import { config } from "../config.js"

const execFileAsync = promisify(execFile)

function resolvePath(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p
}

async function detectBranchFrom(repoPath: string): Promise<string> {
  // 1. Remote HEAD (e.g. origin/main)
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { timeout: 5000 })
    if (stdout.trim()) return stdout.trim()
  } catch { /* no remote HEAD */ }

  // 2. Known remote branch names
  for (const b of ["origin/main", "origin/master"]) {
    try {
      await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", b], { timeout: 5000 })
      return b
    } catch { /* try next */ }
  }

  // 3. Local HEAD branch (local-only repo)
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "symbolic-ref", "--short", "HEAD"], { timeout: 5000 })
    const localBranch = stdout.trim()
    if (localBranch) return localBranch
  } catch { /* detached HEAD or bare repo */ }

  return "main"
}

export async function reposRoutes(app: FastifyInstance) {
  app.get("/api/repos", async () => {
    return db.select().from(repos).all()
  })

  app.post<{ Body: Omit<Repo, "id" | "createdAt"> }>("/api/repos", async (req, reply) => {
    const existing = db.select().from(repos).where(eq(repos.path, req.body.path)).get()
    if (existing) {
      reply.code(409)
      return { error: "A repository with this path is already registered" }
    }
    const now = new Date().toISOString()
    const id = uuid()
    const body = req.body
    await db.insert(repos).values({
      id,
      name: body.name,
      path: body.path,
      workspacesPath: body.workspacesPath ?? path.join(config.workspacesBase, body.name),
      branchFrom: body.branchFrom ?? "origin/main",
      branchPrefix: body.branchPrefix ?? null,
      remote: body.remote ?? "origin",
      previewUrl: body.previewUrl,
      setupScript: body.setupScript,
      runScript: body.runScript,
      archiveScript: body.archiveScript,
      createdAt: now,
    })
    reply.code(201)
    return db.select().from(repos).where(eq(repos.id, id)).get()
  })

  app.patch<{ Params: { id: string }; Body: Partial<Repo> }>("/api/repos/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body
    await db.update(repos).set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.path !== undefined && { path: body.path }),
      ...(body.workspacesPath !== undefined && { workspacesPath: body.workspacesPath }),
      ...(body.branchFrom !== undefined && { branchFrom: body.branchFrom }),
      ...(body.branchPrefix !== undefined && { branchPrefix: body.branchPrefix }),
      ...(body.remote !== undefined && { remote: body.remote }),
      ...(body.previewUrl !== undefined && { previewUrl: body.previewUrl }),
      ...(body.setupScript !== undefined && { setupScript: body.setupScript }),
      ...(body.runScript !== undefined && { runScript: body.runScript }),
      ...(body.archiveScript !== undefined && { archiveScript: body.archiveScript }),
      ...(body.preferences !== undefined && { preferences: body.preferences }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.poolSize !== undefined && { poolSize: body.poolSize ?? 0 }),
    }).where(eq(repos.id, id))
    const updated = db.select().from(repos).where(eq(repos.id, id)).get()
    if (!updated) return reply.code(404).send({ error: "Not found" })
    return updated
  })

  app.delete<{ Params: { id: string } }>("/api/repos/:id", async (req, reply) => {
    // Delete agents first — the FK constraint lacks ON DELETE CASCADE (SQLite can't alter it)
    db.delete(agents).where(eq(agents.repoId, req.params.id)).run()
    db.delete(repos).where(eq(repos.id, req.params.id)).run()
    reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>("/api/repos/:id/branches", async (req, reply) => {
    const repo = db.select().from(repos).where(eq(repos.id, req.params.id)).get()
    if (!repo) return reply.code(404).send({ error: "Not found" })
    const repoUrl = await getRemoteUrl(repo.path, repo.remote).catch(() => null)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })
    const branches = await listBranches(repoUrl).catch(() => [] as string[])
    return branches
  })

  // POST /api/repos/clone — clone a remote git repo and register it
  app.post<{ Body: { url: string; location: string; name?: string } }>("/api/repos/clone", async (req, reply) => {
    const { url, location, name } = req.body
    if (!url?.trim()) return reply.code(400).send({ error: "url required" })
    if (!location?.trim()) return reply.code(400).send({ error: "location required" })

    const resolvedLocation = resolvePath(location.trim())
    const repoName = name?.trim() || url.split("/").pop()?.replace(/\.git$/, "") || "repo"

    const parentDir = path.dirname(resolvedLocation)
    if (!fsSync.existsSync(parentDir)) {
      return reply.code(400).send({ error: `Parent directory does not exist: ${parentDir}` })
    }
    if (fsSync.existsSync(resolvedLocation)) {
      return reply.code(400).send({ error: `Destination already exists: ${resolvedLocation}` })
    }

    try {
      await execFileAsync("git", ["clone", url.trim(), resolvedLocation], { timeout: 120_000 })
    } catch (err) {
      const msg = String((err as Error & { stderr?: string }).stderr ?? (err as Error).message ?? err)
      return reply.code(400).send({ error: `Clone failed: ${msg.split("\n")[0]}` })
    }

    const branchFrom = await detectBranchFrom(resolvedLocation)
    const id = uuid()
    const now = new Date().toISOString()
    db.insert(repos).values({
      id,
      name: repoName,
      path: resolvedLocation,
      workspacesPath: path.join(config.workspacesBase, repoName),
      branchFrom,
      branchPrefix: null,
      remote: "origin",
      createdAt: now,
    }).run()

    reply.code(201)
    return db.select().from(repos).where(eq(repos.id, id)).get()
  })

  // POST /api/repos/quick-start — scaffold a new project from a template and register it
  app.post<{ Body: { name: string; location: string; template: "empty" | "vite" | "tanstack-start" } }>("/api/repos/quick-start", async (req, reply) => {
    const { name, location, template } = req.body
    if (!name?.trim()) return reply.code(400).send({ error: "name required" })
    if (!location?.trim()) return reply.code(400).send({ error: "location required" })
    if (!["empty", "vite", "tanstack-start"].includes(template)) return reply.code(400).send({ error: "invalid template" })

    const resolvedParent = resolvePath(location.trim())
    const projectPath = path.join(resolvedParent, name.trim())

    if (!fsSync.existsSync(resolvedParent)) {
      return reply.code(400).send({ error: `Location does not exist: ${resolvedParent}` })
    }
    if (fsSync.existsSync(projectPath)) {
      return reply.code(400).send({ error: `Directory already exists: ${projectPath}` })
    }

    try {
      if (template === "empty") {
        fsSync.mkdirSync(projectPath, { recursive: true })
      } else if (template === "vite") {
        await execFileAsync("npm", ["create", "vite@latest", name.trim(), "--", "--template", "react-ts"], {
          cwd: resolvedParent,
          timeout: 120_000,
          env: { ...process.env, npm_config_yes: "true" },
        })
      } else {
        await execFileAsync("npx", ["create-tsrouter-app@latest", name.trim(), "--framework", "react", "--target", "file-router", "--package-manager", "npm"], {
          cwd: resolvedParent,
          timeout: 120_000,
          env: { ...process.env, npm_config_yes: "true" },
        })
      }
    } catch (err) {
      const msg = String((err as Error & { stderr?: string }).stderr ?? (err as Error).message ?? err)
      return reply.code(400).send({ error: `Scaffold failed: ${msg.split("\n")[0]}` })
    }

    if (!fsSync.existsSync(projectPath)) {
      return reply.code(400).send({ error: "Scaffold completed but project directory not found" })
    }

    // Initialize git repo if not already one
    if (!fsSync.existsSync(path.join(projectPath, ".git"))) {
      try {
        await execFileAsync("git", ["init"], { cwd: projectPath, timeout: 5000 })
        await execFileAsync("git", ["add", "-A"], { cwd: projectPath, timeout: 5000 })
        await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: projectPath, timeout: 10_000, env: { ...process.env, GIT_AUTHOR_NAME: "Hive", GIT_AUTHOR_EMAIL: "hive@local", GIT_COMMITTER_NAME: "Hive", GIT_COMMITTER_EMAIL: "hive@local" } })
      } catch { /* non-fatal */ }
    }

    const id = uuid()
    const now = new Date().toISOString()
    db.insert(repos).values({
      id,
      name: name.trim(),
      path: projectPath,
      workspacesPath: path.join(config.workspacesBase, name.trim()),
      branchFrom: "main",
      branchPrefix: null,
      remote: "origin",
      createdAt: now,
    }).run()

    reply.code(201)
    return db.select().from(repos).where(eq(repos.id, id)).get()
  })
}
